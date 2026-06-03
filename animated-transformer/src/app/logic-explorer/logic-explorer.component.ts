/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

import { Component, OnInit, signal, computed, viewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

import { parseContext, printTerm, Term, Context } from '../../lib/logic_v2/logic';
import { getApplicableActions, printLolliAction, ActionMatch, LolliAction, LinearResource } from '../../lib/logic_v2/linear';
import { Story, StoryStep } from '../../lib/logic_v2/story';
import { PRESET_EXAMPLES, PresetExample } from './preset-examples';
import {
  MonacoJavaScriptEditorComponent,
  CodeStrUpdate,
  CodeStrUpdateKind,
} from '../monaco-js-editor/monaco-js-editor.component';
import { updateLinearLogicTokens, updateLogicTheme, DEFAULT_THEME_CONFIG, LogicThemeConfig } from '../monaco-editor-loader';

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
    RouterModule,
    MonacoJavaScriptEditorComponent,
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
  
  // UI Filters & Selection State Signals
  readonly selectedResourceName = signal<string | null>(null); // Resource picked to find matching rules
  readonly selectedActionName = signal<string | null>(null);   // Rule picked to inspect details

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

  constructor() {}

  ngOnInit() {
    const savedLeft = localStorage.getItem('logic-explorer-left-width');
    const savedRight = localStorage.getItem('logic-explorer-right-width');
    if (savedLeft) this.leftWidth.set(parseInt(savedLeft, 10));
    if (savedRight) this.rightWidth.set(parseInt(savedRight, 10));

    this.selectPreset(this.selectedPresetName());
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
      const newStory = new Story(ctxt);
      
      this.story.set(newStory);
      this.currentContext.set(newStory.getCurrentContext());
      this.errorMessage.set(null);
      
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
  }

  /**
   * Selects/Picks a resource to find matching lolli actions that consume it.
   */
  toggleResourceSelection(resName: string) {
    if (this.selectedResourceName() === resName) {
      this.selectedResourceName.set(null);
    } else {
      this.selectedResourceName.set(resName);
      // Clear action select so view is focused on resource matches
      this.selectedActionName.set(null);
    }
  }

  /**
   * Selects/Picks a lolli action/rule to inspect its general applicability combinations.
   */
  selectAction(actName: string) {
    if (this.selectedActionName() === actName) {
      this.selectedActionName.set(null);
    } else {
      this.selectedActionName.set(actName);
      // Clear resource filter
      this.selectedResourceName.set(null);
    }
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
}

