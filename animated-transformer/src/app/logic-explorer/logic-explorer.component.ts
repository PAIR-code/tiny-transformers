/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

import { Component, OnInit, signal, computed, viewChild, ElementRef, ChangeDetectionStrategy, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';

import { parseContext, parseTerm, printTerm, Term, Context, registerDefaultTSFunctions, substitute, evaluateTerm, TermKind } from '../../lib/logic_v2/logic';
import { getApplicableActions, printLolliAction, ActionMatch, LolliAction, LinearResource, LinearStory } from '../../lib/logic_v2/linear';
import { Story, StoryStep } from '../../lib/logic_v2/story';
import { PRESET_EXAMPLES, PresetExample } from './preset-examples';
import {
  MonacoJavaScriptEditorComponent,
  CodeStrUpdate,
  CodeStrUpdateKind,
} from '../monaco-js-editor/monaco-js-editor.component';
import { updateLinearLogicTokens, updateLogicTheme, DEFAULT_THEME_CONFIG, LogicThemeConfig } from '../monaco-editor-loader';
import { D3LineChartComponent, NamedChartPoint, CurveKind, ScalingKind, defaultChartConfig } from '../d3-line-chart/d3-line-chart.component';

import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface SimMappingRule {
  name: string;
  literal: string;
  argIndex?: number;
  argName?: string;
  matchValue?: string;
}

@Component({
  selector: 'app-logic-explorer',
  templateUrl: './logic-explorer.component.html',
  styleUrls: ['./logic-explorer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterModule,
    MonacoJavaScriptEditorComponent,
    D3LineChartComponent,
  ],
})
export class LogicExplorerComponent implements OnInit {
  // Presets list
  readonly presets = PRESET_EXAMPLES;
  
  // State Signals
  readonly selectedPresetName = signal<string>(PRESET_EXAMPLES[0].name);
  readonly rawSource = signal<string>('');
  readonly story = signal<Story | null>(null);
  readonly currentContext = signal<Context | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Syntax Editor Backdrop & Highlight computed signals
  readonly backdropElement = viewChild<ElementRef>('backdrop');
  readonly highlightedHtml = computed(() => this.tokenizeSource(this.rawSource()));
  readonly editorExpanded = signal<boolean>(false);
  readonly editorWordWrap = signal<boolean>(true);
  
  // Theme Color Customizer Signals
  readonly showThemeCustomizer = signal<boolean>(false);
  readonly themeConfigJson = signal<string>(JSON.stringify(DEFAULT_THEME_CONFIG, null, 2));
  readonly themeJsonError = signal<string | null>(null);
  readonly currentThemeConfig = signal<LogicThemeConfig>({ ...DEFAULT_THEME_CONFIG });

  // Panel Resize State Signals
  readonly leftWidth = signal<number>(320);
  readonly rightWidth = signal<number>(360);

  private activeResizer: 'left' | 'right' | null = null;
  private startX = 0;
  private startWidth = 0;
  private compiledSource = '';
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  
  // UI Filters & Selection State Signals
  readonly selectedResourceName = signal<string | null>(null); // Resource picked to find matching rules
  readonly selectedActionName = signal<string | null>(null);   // Rule picked to inspect details
  readonly selectedApplication = signal<ActionMatch | null>(null); // Specific rule application clicked/hovered

  // Probabilistic Simulator Signals
  readonly activeMiddleMode = signal<'explorer' | 'simulator'>('explorer');
  readonly simSteps = signal<number | null>(200);
  readonly simMode = signal<'proportional' | 'softmax'>('proportional');
  readonly simTemp = signal<number>(1.0);
  readonly simDataPoints = signal<NamedChartPoint[]>([]);
  readonly simRunning = signal<boolean>(false);
  readonly simSummary = signal<string | null>(null);
  readonly simMappingJson = signal<string>('');
  readonly simMappingError = signal<string | null>(null);
  readonly simFinalState = signal<{ name: string; typeStr: string }[]>([]);

  readonly simChartConfig = computed(() => {
    const config = defaultChartConfig();
    config.xLabel = 'Simulation Step';
    config.yLabel = 'Population Size';
    config.width = 500;
    config.height = 250;
    config.legendX = 350;
    config.legendY = 10;
    return config;
  });

  // Applicable matches cache
  readonly applicableActions = signal<ActionMatch[]>([]);

  // List of all unique lolli actions/rules in the current context
  readonly declaredActions = computed(() => {
    const ctxt = this.currentContext();
    if (!ctxt) return [];
    return Object.values(ctxt.actions);
  });

  // Map Action Name -> Boolean (Is it currently applicable?)
  readonly actionApplicabilityMap = computed(() => {
    const apps = this.applicableActions();
    const map = new Map<string, boolean>();
    for (const app of apps) {
      map.set(app.action.name, true);
    }
    return map;
  });

  // Detailed applications of the currently selected rule
  readonly selectedActionApplications = computed(() => {
    const actName = this.selectedActionName();
    const apps = this.applicableActions();
    if (!actName) return [];
    return apps.filter(m => m.action.name === actName);
  });

  // Applications that match / consume the selected resource
  readonly resourceMatchingApplications = computed(() => {
    const resName = this.selectedResourceName();
    const apps = this.applicableActions();
    if (!resName) return [];
    return apps.filter(m => Array.from(m.matchedResources.values()).includes(resName));
  });

  // List of linear resources in the current context
  readonly activeLinearResources = computed(() => {
    const ctxt = this.currentContext();
    if (!ctxt) return [];
    return Object.entries(ctxt.linearResources).map(([name, typeStr]) => ({
      name,
      typeStr,
    }));
  });

  // Timeline steps list
  readonly storySteps = computed(() => {
    const s = this.story();
    return s ? s.steps : [];
  });

  constructor() {
    effect(() => {
      const preset = this.selectedPresetName();
      const mode = this.activeMiddleMode();
      const steps = this.simSteps();

      this.updateQueryParams({
        preset,
        mode,
        steps,
      });
    });
  }

  private updateQueryParams(params: Record<string, any>) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  ngOnInit() {
    const savedLeft = localStorage.getItem('logic-explorer-left-width');
    const savedRight = localStorage.getItem('logic-explorer-right-width');
    if (savedLeft) this.leftWidth.set(parseInt(savedLeft, 10));
    if (savedRight) this.rightWidth.set(parseInt(savedRight, 10));

    // Read initial query params synchronously
    const params = this.route.snapshot.queryParamMap;
    const presetParam = params.get('preset');
    let initialPreset = this.selectedPresetName();
    if (presetParam) {
      const hasPreset = this.presets.some(p => p.name === presetParam);
      if (hasPreset) {
        initialPreset = presetParam;
      }
    }

    const modeParam = params.get('mode');
    if (modeParam === 'explorer' || modeParam === 'simulator') {
      this.activeMiddleMode.set(modeParam);
    }

    const stepsParam = params.get('steps');
    if (stepsParam) {
      const val = parseInt(stepsParam, 10);
      if (!isNaN(val)) {
        this.simSteps.set(val);
      }
    }

    this.selectPreset(initialPreset);
  }

  /**
   * Loads a preset example case study.
   */
  selectPreset(name: string) {
    const preset = this.presets.find(p => p.name === name);
    if (preset) {
      this.selectedPresetName.set(name);
      this.rawSource.set(preset.src);
      this.compileSource(preset.src);

      const mapping = preset.defaultMapping || [];
      const mappingStr = JSON.stringify(mapping, null, 2);
      this.simMappingJson.set(mappingStr);
      this.simMappingError.set(null);
      this.simFinalState.set([]);
    }
  }

  onMappingJsonInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    if (target) {
      this.onMappingJsonChange(target.value);
    }
  }

  onMappingJsonChange(jsonStr: string) {
    this.simMappingJson.set(jsonStr);
    try {
      if (!jsonStr.trim()) {
        this.simMappingError.set(null);
        return;
      }
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error('Mapping must be a JSON array of rules.');
      }
      for (const rule of parsed) {
        if (!rule.name || !rule.literal) {
          throw new Error('Each mapping rule must have "name" and "literal" fields.');
        }
      }
      this.simMappingError.set(null);
    } catch (e) {
      this.simMappingError.set((e as Error).message);
    }
  }

  /**
   * Handles the native change event from the preset selector dropdown.
   */
  onPresetChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target) {
      this.selectPreset(target.value);
    }
  }

  /**
   * Initiates horizontal resizing of left or right explorer panels.
   */
  onMouseDown(event: MouseEvent, side: 'left' | 'right') {
    event.preventDefault();
    this.activeResizer = side;
    this.startX = event.clientX;
    this.startWidth = side === 'left' ? this.leftWidth() : this.rightWidth();

    window.addEventListener('mousemove', this.onMouseMoveBound);
    window.addEventListener('mouseup', this.onMouseUpBound);
  }

  private readonly onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
  private readonly onMouseUpBound = () => this.onMouseUp();

  private onMouseMove(event: MouseEvent) {
    if (!this.activeResizer) return;

    const deltaX = event.clientX - this.startX;
    if (this.activeResizer === 'left') {
      const newWidth = Math.max(220, Math.min(600, this.startWidth + deltaX));
      this.leftWidth.set(newWidth);
    } else {
      const newWidth = Math.max(220, Math.min(600, this.startWidth - deltaX));
      this.rightWidth.set(newWidth);
    }
  }

  private onMouseUp() {
    if (this.activeResizer) {
      localStorage.setItem('logic-explorer-left-width', this.leftWidth().toString());
      localStorage.setItem('logic-explorer-right-width', this.rightWidth().toString());
      this.activeResizer = null;
    }
    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mouseup', this.onMouseUpBound);
  }

  /**
   * Resets the resizable panel sizes to default.
   */
  resetPanelWidths() {
    this.leftWidth.set(320);
    this.rightWidth.set(360);
    localStorage.removeItem('logic-explorer-left-width');
    localStorage.removeItem('logic-explorer-right-width');
  }


  /**
   * Compiles/Parses raw source text into active Context & Story session.
   */
  compileSource(src: string) {
    try {
      const ctxt = parseContext(src);
      registerDefaultTSFunctions(ctxt);
      const newStory = new Story(ctxt);
      
      this.story.set(newStory);
      this.currentContext.set(newStory.getCurrentContext());
      this.errorMessage.set(null);
      this.compiledSource = src;
      
      // Reset selections
      this.selectedResourceName.set(null);
      this.selectedActionName.set(null);
      
      this.refreshApplicableActions();

      // Dynamically extract registered names to keep editor highlights synchronized perfectly!
      const rawData = ctxt.getRawData();
      const constructors = Object.keys(rawData.constructors);
      const functions = Object.keys(rawData.functions);
      const actions = Object.keys(rawData.actions);
      const types = Object.keys(rawData.types);
      updateLinearLogicTokens(constructors, functions, actions, types);
    } catch (e) {
      this.errorMessage.set((e as Error).message);
      this.story.set(null);
      this.currentContext.set(null);
      this.applicableActions.set([]);
    }
  }

  /**
   * Re-calculates all applicable actions from the current story state.
   */
  refreshApplicableActions() {
    const ctxt = this.currentContext();
    if (ctxt) {
      const actions = getApplicableActions(ctxt);
      this.applicableActions.set(actions);
    } else {
      this.applicableActions.set([]);
    }
  }

  /**
   * Triggers parse compilation of user edited source text.
   */
  onCompileClick() {
    this.compileSource(this.rawSource());
  }

  /**
   * Handles updates from the Monaco Editor.
   */
  handleCodeUpdate(update: CodeStrUpdate) {
    if (update.kind === CodeStrUpdateKind.UpdatedValue) {
      this.rawSource.set(update.str);
    }
  }

  /**
   * Toggles editor expansion full page state.
   */
  toggleEditorExpansion() {
    this.editorExpanded.set(!this.editorExpanded());
  }

  /**
   * Toggles Monaco editor word wrapping state.
   */
  toggleWordWrap() {
    this.editorWordWrap.set(!this.editorWordWrap());
  }

  /**
   * Applies a matched logic rule transition to the story.
   */
  applyTransition(match: ActionMatch) {
    const activeStory = this.story();
    if (!activeStory) return;

    activeStory.applyAction(match);
    
    // Update dynamic state
    this.currentContext.set(activeStory.getCurrentContext());
    
    // Keep current selections, but refresh matches
    this.refreshApplicableActions();
    this.selectedApplication.set(null);
  }

  /**
   * Steps backward in time, removing the last action step.
   */
  undoLastStep() {
    const activeStory = this.story();
    if (!activeStory || activeStory.steps.length === 0) return;

    activeStory.steps.pop();
    
    // Re-evaluate current active context & applicability
    this.currentContext.set(activeStory.getCurrentContext());
    this.refreshApplicableActions();
    this.selectedApplication.set(null);
  }

  /**
   * Completely resets story execution back to the initial context.
   */
  resetStory() {
    const activeStory = this.story();
    if (!activeStory) return;

    activeStory.steps = [];
    this.currentContext.set(activeStory.getCurrentContext());
    this.refreshApplicableActions();
    
    this.selectedResourceName.set(null);
    this.selectedActionName.set(null);
    this.selectedApplication.set(null);
  }

  /**
   * Selects/Picks a resource to find matching lolli actions that consume it.
   */
  toggleResourceSelection(resName: string) {
    if (this.selectedResourceName() === resName) {
      this.selectedResourceName.set(null);
      this.selectedApplication.set(null);
    } else {
      this.selectedResourceName.set(resName);
      // Clear action select so view is focused on resource matches
      this.selectedActionName.set(null);
      this.selectedApplication.set(null);
    }
  }

  /**
   * Selects/Picks a lolli action/rule to inspect its general applicability combinations.
   */
  selectAction(actName: string) {
    if (this.selectedActionName() === actName) {
      this.selectedActionName.set(null);
      this.selectedApplication.set(null);
    } else {
      this.selectedActionName.set(actName);
      // Clear resource filter
      this.selectedResourceName.set(null);
      this.selectedApplication.set(null);
    }
  }

  /**
   * Selects/Picks a specific rule application match.
   */
  selectApplication(app: ActionMatch | null) {
    if (this.selectedApplication() === app) {
      this.selectedApplication.set(null);
    } else {
      this.selectedApplication.set(app);
    }
  }

  /**
   * Returns true if a resource is consumed/matched by the selected rule/application.
   */
  isResourceHighlighted(resName: string): boolean {
    const app = this.selectedApplication();
    if (app) {
      return Array.from(app.matchedResources.values()).includes(resName);
    }

    const actName = this.selectedActionName();
    if (actName) {
      const apps = this.selectedActionApplications();
      return apps.some(a => Array.from(a.matchedResources.values()).includes(resName));
    }

    const resNameSelected = this.selectedResourceName();
    if (resNameSelected) {
      return resNameSelected === resName;
    }

    return false;
  }

  /**
   * Prints a full LolliAction rule to string format for UI display.
   */
  formatAction(action: LolliAction): string {
    return printLolliAction(action);
  }

  /**
   * Helper to compute visual resource changes between context transitions.
   */
  getStepDiff(step: StoryStep) {
    const before = step.contextBefore.linearResources;
    const after = step.contextAfter.linearResources;

    const consumed: { name: string; typeStr: string }[] = [];
    const produced: { name: string; typeStr: string }[] = [];
    const unchanged: { name: string; typeStr: string }[] = [];

    for (const [name, typeStr] of Object.entries(before)) {
      if (!(name in after)) {
        consumed.push({ name, typeStr });
      } else {
        unchanged.push({ name, typeStr });
      }
    }

    for (const [name, typeStr] of Object.entries(after)) {
      if (!(name in before)) {
        produced.push({ name, typeStr });
      }
    }

    return { consumed, produced, unchanged };
  }

  /**
   * Format a map of matched variables for cleaner display.
   */
  formatMatchedResources(matched: Map<string, string>): string {
    return Array.from(matched.entries())
      .map(([vName, rName]) => `?${vName} ↦ ${rName}`)
      .join(', ');
  }

  /**
   * Formats substituted RHS results for previewing rule output.
   */
  formatRhsOutputs(match: ActionMatch): string[] {
    return match.action.rhs.map(pattern => {
      try {
        return `?${pattern.varName}: ${printTerm(pattern.typePattern)}`;
      } catch(e) {
        return `?${pattern.varName}: (untyped)`;
      }
    });
  }

  /**
   * Prints a term's type pattern cleanly.
   */
  getTermString(term: Term): string {
    return printTerm(term, { ctxt: this.currentContext() || undefined });
  }

  /**
   * Formats a matched action combination as a concrete function application call.
   * Example: concat(_r1, _r2)
   */
  formatApplicationCall(match: ActionMatch): string {
    const args = match.action.lhs.map(p => {
      const rName = match.matchedResources.get(p.varName) || `?${p.varName}`;
      return rName;
    }).join(', ');
    return `${match.action.name}(${args})`;
  }

  /**
   * Synchronizes scroll offset of Code pre backdrop with transparent textarea.
   */
  onScroll(event: any) {
    const textarea = event.target;
    const backdrop = this.backdropElement();
    if (backdrop) {
      backdrop.nativeElement.scrollTop = textarea.scrollTop;
      backdrop.nativeElement.scrollLeft = textarea.scrollLeft;
    }
  }

  /**
   * Dynamic regex tokenizer to build syntax highlighted HTML from custom logic text.
   */
  tokenizeSource(src: string): string {
    if (!src) return '';

    const escapeHtml = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const lines = src.split('\n');
    const highlightedLines = lines.map(line => {
      if (!line) return '';
      
      const escaped = escapeHtml(line);
      
      return escaped.replace(
        /(\b(let|type|fun|action)\b)|(\?[a-zA-Z_][a-zA-Z0-9_]*)|(\&#039;[a-zA-Z_][a-zA-Z0-9_]*)|(\b_[a-zA-Z0-9_]+\b)|(\b\d+\b)|(-o|\➔|=|\*|\||:|(?<!&(?:lt|gt|amp|quot|#039));)/g,
        (match, keyword, kwText, variable, typeParam, resource, num, symbol) => {
          if (keyword) return `<span class="hl-keyword">${match}</span>`;
          if (variable) return `<span class="hl-var">${match}</span>`;
          if (typeParam) return `<span class="hl-type-param">${match}</span>`;
          if (resource) return `<span class="hl-resource">${match}</span>`;
          if (num) return `<span class="hl-number">${match}</span>`;
          if (symbol) return `<span class="hl-symbol">${match}</span>`;
          return match;
        }
      );
    });

    return highlightedLines.join('\n');
  }

  /**
   * Toggles theme customization drawer in the UI.
   */
  toggleThemeCustomizer() {
    this.showThemeCustomizer.set(!this.showThemeCustomizer());
  }

  /**
   * Resets Monaco theme overrides back to repository defaults.
   */
  resetThemeToDefault() {
    this.themeConfigJson.set(JSON.stringify(DEFAULT_THEME_CONFIG, null, 2));
    this.currentThemeConfig.set({ ...DEFAULT_THEME_CONFIG });
    this.themeJsonError.set(null);
    updateLogicTheme(DEFAULT_THEME_CONFIG);
  }

  /**
   * Live updates Monaco custom theme whenever JSON string changes.
   */
  onThemeJsonChange(jsonStr: string) {
    this.themeConfigJson.set(jsonStr);
    try {
      const parsed = JSON.parse(jsonStr);
      
      // Verify all keys exist in parsed object to prevent invalid configuration crashes
      const requiredKeys: (keyof LogicThemeConfig)[] = [
        'keyword', 'constructor', 'function', 'action', 'type', 'variable', 'number', 'comment', 'background',
        'lolli', 'pipe', 'colon', 'equals'
      ];
      for (const k of requiredKeys) {
        if (!(k in parsed) || typeof parsed[k] !== 'string') {
          throw new Error(`Missing or invalid theme color property: '${k}'`);
        }
      }
      
      this.currentThemeConfig.set(parsed);
      this.themeJsonError.set(null);
      updateLogicTheme(parsed);
    } catch (e) {
      this.themeJsonError.set((e as Error).message);
    }
  }

  /**
   * Handles native input event for custom JSON theme modifications.
   */
  onThemeJsonInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    if (target) {
      this.onThemeJsonChange(target.value);
    }
  }

  /**
   * Copies theme config JSON to the user's clipboard for easy copy-back into code.
   */
  copyThemeToClipboard() {
    navigator.clipboard.writeText(this.themeConfigJson()).then(() => {
      alert('Theme JSON configuration copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy theme config:', err);
    });
  }

  parseNumber(event: Event): number | null {
    const rawVal = (event.target as HTMLInputElement).value;
    if (rawVal.trim() === '') return null;
    const val = parseInt(rawVal, 10);
    return isNaN(val) ? null : val;
  }

  parseFloatInput(event: Event): number {
    const val = parseFloat((event.target as HTMLInputElement).value);
    return isNaN(val) ? 1.0 : val;
  }

  onSimModeChange(event: Event) {
    this.simMode.set((event.target as HTMLSelectElement).value as any);
  }

  runSimulation() {
    if (this.rawSource() !== this.compiledSource) {
      this.compileSource(this.rawSource());
    }

    const startContext = this.currentContext();
    if (!startContext || this.errorMessage()) return;

    this.simRunning.set(true);
    this.simSummary.set(null);
    this.simFinalState.set([]);

    // Deep copy/clone starting state
    let ctxt = new Context({
      types: { ...startContext.getRawData().types },
      constructors: { ...startContext.getRawData().constructors },
      functions: { ...startContext.getRawData().functions },
      actions: { ...startContext.getRawData().actions },
      linearResources: { ...startContext.getRawData().linearResources },
      variables: { ...startContext.getRawData().variables },
    });

    const dataPoints: NamedChartPoint[] = [];

    const steps = this.simSteps();
    if (steps === null || steps <= 0) {
      this.simRunning.set(false);
      return;
    }
    const mode = this.simMode();
    const temp = this.simTemp();

    // Parse Mapping Rules
    let mappingRules: SimMappingRule[] = [];
    try {
      const mappingStr = this.simMappingJson().trim();
      if (mappingStr) {
        mappingRules = JSON.parse(mappingStr);
        if (!Array.isArray(mappingRules)) {
          throw new Error('Mapping must be a JSON array.');
        }
      }
    } catch (e) {
      this.simSummary.set(`Simulator Mapping Error: ${(e as Error).message}`);
      this.simRunning.set(false);
      return;
    }

    if (mappingRules.length === 0) {
      // Fallback: build rules for all unique literal names in the current context
      const literals = new Set<string>();
      for (const [_, typeStr] of Object.entries(ctxt.linearResources)) {
        try {
          const term = parseTerm(typeStr, ctxt);
          if (term.kind === TermKind.Literal) {
            literals.add(term.literalName);
          }
        } catch (e) {}
      }
      mappingRules = Array.from(literals).map(lit => ({
        name: lit,
        literal: lit
      }));
    }

    // Helper to record data point
    const recordPoint = (stepIdx: number, context: Context) => {
      const stepSums = new Map<string, number>();
      for (const rule of mappingRules) {
        stepSums.set(rule.name, 0);
      }

      for (const [_, typeStr] of Object.entries(context.linearResources)) {
        try {
          const term = parseTerm(typeStr, context);
          if (term.kind === TermKind.Literal) {
            for (const rule of mappingRules) {
              if (term.literalName === rule.literal) {
                if (rule.matchValue !== undefined) {
                  let argTerm: Term | undefined;
                  if (rule.argIndex !== undefined) {
                    argTerm = term.unNamedArgs[rule.argIndex];
                  } else if (rule.argName !== undefined) {
                    argTerm = term.namedArgs[rule.argName];
                  }
                  if (argTerm && argTerm.kind === TermKind.Literal && argTerm.literalName === rule.matchValue) {
                    stepSums.set(rule.name, (stepSums.get(rule.name) || 0) + 1);
                  }
                } else if (rule.argIndex !== undefined || rule.argName !== undefined) {
                  let argTerm: Term | undefined;
                  if (rule.argIndex !== undefined) {
                    argTerm = term.unNamedArgs[rule.argIndex];
                  } else if (rule.argName !== undefined) {
                    argTerm = term.namedArgs[rule.argName];
                  }
                  if (argTerm && argTerm.kind === TermKind.Literal) {
                    const val = parseFloat(argTerm.literalName);
                    if (!isNaN(val)) {
                      stepSums.set(rule.name, (stepSums.get(rule.name) || 0) + val);
                    }
                  }
                } else {
                  stepSums.set(rule.name, (stepSums.get(rule.name) || 0) + 1);
                }
              }
            }
          }
        } catch (e) {}
      }

      for (const rule of mappingRules) {
        dataPoints.push({
          x: stepIdx,
          y: stepSums.get(rule.name) || 0,
          name: rule.name
        });
      }
    };

    // Initial point
    recordPoint(0, ctxt);
    this.simDataPoints.set([...dataPoints]);

    let currentStep = 0;
    const batchSize = Math.max(1, Math.ceil(steps / 100));

    const runBatch = () => {
      if (!this.simRunning()) {
        return;
      }

      let stepsInThisBatch = 0;
      let matches = getApplicableActions(ctxt);

      while (currentStep < steps && stepsInThisBatch < batchSize && matches.length > 0) {
        // 2. Evaluate scores
        const scoredMatches = matches.map(match => {
          let scoreVal = 1.0;
          if (match.action.score) {
            try {
              // Substitute and evaluate score term
              const substituted = substitute(match.action.score, match.subst) as Term;
              const evaluated = evaluateTerm(ctxt, substituted);
              if (evaluated.kind === TermKind.Literal) {
                scoreVal = parseFloat(evaluated.literalName);
              }
            } catch (e) {
              console.error('Failed to evaluate score:', e);
            }
          }
          if (isNaN(scoreVal) || scoreVal < 0) {
            scoreVal = 0;
          }
          return { match, score: scoreVal };
        });

        // 3. Convert scores to probabilities
        let probabilities: number[] = [];
        if (mode === 'softmax') {
          const scores = scoredMatches.map(sm => sm.score);
          const maxScore = Math.max(...scores);
          const expScores = scores.map(s => Math.exp((s - maxScore) / temp));
          const sumExp = expScores.reduce((a, b) => a + b, 0);
          probabilities = sumExp === 0 ? expScores.map(() => 1 / expScores.length) : expScores.map(es => es / sumExp);
        } else {
          // proportional mode
          const sumScores = scoredMatches.reduce((acc, sm) => acc + sm.score, 0);
          if (sumScores === 0) {
            probabilities = scoredMatches.map(() => 1 / scoredMatches.length);
          } else {
            probabilities = scoredMatches.map(sm => sm.score / sumScores);
          }
        }

        // 4. Sample action based on probabilities
        const rand = Math.random();
        let cumulative = 0;
        let selectedIdx = 0;
        for (let i = 0; i < probabilities.length; i++) {
          cumulative += probabilities[i];
          if (rand < cumulative) {
            selectedIdx = i;
            break;
          }
        }

        const chosenMatch = scoredMatches[selectedIdx].match;

        // 5. Apply chosen action
        const storyState = LinearStory.fromContext(ctxt);
        const nextStoryState = storyState.applyAction(chosenMatch);

        // Reconstruct context with next active resources
        ctxt = new Context({
          types: { ...ctxt.getRawData().types },
          constructors: { ...ctxt.getRawData().constructors },
          functions: { ...ctxt.getRawData().functions },
          actions: { ...ctxt.getRawData().actions },
          linearResources: {},
          variables: {},
        });

        for (const res of nextStoryState.resources) {
          ctxt.declareLinearResource(res.name, res.type);
        }

        currentStep++;
        recordPoint(currentStep, ctxt);
        stepsInThisBatch++;

        matches = getApplicableActions(ctxt);
      }

      // Update the chart data points signal with the accumulated points so far
      this.simDataPoints.set([...dataPoints]);

      if (currentStep < steps && matches.length > 0) {
        requestAnimationFrame(runBatch);
      } else {
        this.simRunning.set(false);

        // Save final linear resources
        const finalResources = Object.entries(ctxt.linearResources).map(([name, typeStr]) => ({
          name,
          typeStr,
        }));
        this.simFinalState.set(finalResources);

        this.simSummary.set(
          `Simulation finished successfully at step ${currentStep}.`
        );
      }
    };

    // Schedule first batch async
    setTimeout(runBatch, 0);
  }
}
