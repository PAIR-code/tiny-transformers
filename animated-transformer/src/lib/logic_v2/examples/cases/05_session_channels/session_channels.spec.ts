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

import { getApplicableActions } from '../../../linear';
import { Story } from '../../../story';
import { parseContext } from '../../../logic';

export const SESSION_CHANNELS_SRC = [
  'type message = ping | pong | close;',
  'type status = active | closed;',
  'type nat = 0 | suc(num: nat);',
  'type channel = chan(id: nat, msg: message, state: status);',
  'action sendPing: { ?c: chan(?id, close, active) } -o { ?c2: chan(?id, ping, active) };',
  'action replyPong: { ?c: chan(?id, ping, active) } -o { ?c2: chan(?id, pong, active) };',
  'action terminate: { ?c: chan(?id, pong, active) } -o { ?c2: chan(?id, close, closed) };',
  '_r1: chan(suc(0), close, active);',
].join('\n');

describe('Example 5: Asynchronous Session Channels Spec', () => {
  it('runs correctly at runtime', () => {
    const ctxt = parseContext(SESSION_CHANNELS_SRC);
    const story = new Story(ctxt);

    // 1. sendPing action applied: chan(1, close, active) -> chan(1, ping, active)
    const applicable1 = getApplicableActions(ctxt);
    expect(applicable1.length).toBe(1);
    expect(applicable1[0].action.name).toBe('sendPing');

    story.applyAction(applicable1[0]);
    const ctxt2 = story.getCurrentContext();
    expect(ctxt2.linearResources['_r1']).toBeUndefined();
    expect(ctxt2.linearResources['_r2']).toBe('chan(suc(0), ping, active)');

    // 2. replyPong action applied: chan(1, ping, active) -> chan(1, pong, active)
    const applicable2 = getApplicableActions(ctxt2);
    expect(applicable2.length).toBe(1);
    expect(applicable2[0].action.name).toBe('replyPong');

    story.applyAction(applicable2[0]);
    const ctxt3 = story.getCurrentContext();
    expect(ctxt3.linearResources['_r2']).toBeUndefined();
    expect(ctxt3.linearResources['_r3']).toBe('chan(suc(0), pong, active)');

    // 3. terminate action applied: chan(1, pong, active) -> chan(1, close, closed)
    const applicable3 = getApplicableActions(ctxt3);
    expect(applicable3.length).toBe(1);
    expect(applicable3[0].action.name).toBe('terminate');

    story.applyAction(applicable3[0]);
    const ctxt4 = story.getCurrentContext();
    expect(ctxt4.linearResources['_r3']).toBeUndefined();
    expect(ctxt4.linearResources['_r4']).toBe('chan(suc(0), close, closed)');
  });
});
