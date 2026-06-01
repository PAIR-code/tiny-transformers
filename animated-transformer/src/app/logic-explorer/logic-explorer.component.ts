/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';

import { parseContext, printTerm, Term, Context } from '../../lib/logic_v2/logic';
import { getApplicableActions, printLolliAction, ActionMatch, LolliAction, LinearResource } from '../../lib/logic_v2/linear';
import { Story, StoryStep } from '../../lib/logic_v2/story';
import { PRESET_EXAMPLES, PresetExample } from './preset-examples';

@Component({
  selector: 'app-logic-explorer',
  templateUrl: './logic-explorer.component.html',
  styleUrls: ['./logic-explorer.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    RouterModule,
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
}
