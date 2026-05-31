/* Copyright 2026 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

import { Context, Term, substitute, evaluateTerm } from './logic';
import { ActionMatch, LinearStory } from './linear';

export type StoryStep = {
  /** The Context before the action was applied. */
  contextBefore: Context;
  /** The ActionMatch details (which action was applied and which resources matched). */
  actionMatch: ActionMatch;
  /** The Context after the action was applied. */
  contextAfter: Context;
};

/**
 * Represents a linear logic story execution trace.
 * Maintains an initial context, and a chronological sequence of applied actions/steps,
 * along with the context before and after each step.
 */
export class Story {
  public steps: StoryStep[] = [];

  constructor(public initialContext: Context) {}

  /**
   * Returns the active Context after the latest step,
   * or the initial context if no actions have been performed yet.
   */
  getCurrentContext(): Context {
    if (this.steps.length === 0) {
      return this.initialContext;
    }
    return this.steps[this.steps.length - 1].contextAfter;
  }

  /**
   * Applies a matched linear action to transition the story's state, adding a step to the trace.
   */
  applyAction(match: ActionMatch): void {
    const currentCtxt = this.getCurrentContext();

    // 1. Reconstruct the linear resource story state
    const linearStory = LinearStory.fromContext(currentCtxt);

    // 2. Transition the resources by applying the action
    const nextLinearStory = linearStory.applyAction(match);

    // 3. Build the new Context inheriting the types, functions, and actions,
    // but populated with the new active linear resources
    const nextCtxt = new Context({
      types: { ...currentCtxt.getRawData().types },
      constructors: { ...currentCtxt.getRawData().constructors },
      functions: { ...currentCtxt.getRawData().functions },
      actions: { ...currentCtxt.getRawData().actions },
      linearResources: {}, // start with fresh active resources map
      variables: {}, // start with fresh active type variables map
    });

    // Populate the next context with transition resources
    for (const res of nextLinearStory.resources) {
      nextCtxt.declareLinearResource(res.name, res.type);
    }

    // 4. Log the step to the story trace
    this.steps.push({
      contextBefore: currentCtxt,
      actionMatch: match,
      contextAfter: nextCtxt,
    });
  }
}
