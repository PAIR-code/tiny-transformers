/* Copyright 2026 Google LLC. All Rights Reserved.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
...
==============================================================================*/

import { TestBed } from '@angular/core/testing';
import { LogicExplorerComponent } from './logic-explorer.component';
import { provideRouter } from '@angular/router';
import { routes } from '../app.config';
import { provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';

describe('LogicExplorerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
      ],
      imports: [LogicExplorerComponent],
    }).compileComponents();
  });

  it('should create the logic explorer component', () => {
    const fixture = TestBed.createComponent(LogicExplorerComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should change preset and raw source when a preset is selected', () => {
    const fixture = TestBed.createComponent(LogicExplorerComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const firstPreset = component.presets[0];
    expect(component.selectedPresetName()).toBe(firstPreset.name);
    expect(component.rawSource()).toBe(firstPreset.src);

    const secondPreset = component.presets[1];
    component.selectPreset(secondPreset.name);
    fixture.detectChanges();

    expect(component.selectedPresetName()).toBe(secondPreset.name);
    expect(component.rawSource()).toBe(secondPreset.src);
  });


  describe('Syntax Highlighting Tokenizer', () => {
    it('should successfully color let, type, fun, and action keywords', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;

      const source = 'type nat = 0; let x = 0; fun add(0, ?y) = ?y; action grow;';
      const result = component.tokenizeSource(source);

      expect(result).toContain('<span class="hl-keyword">type</span>');
      expect(result).toContain('<span class="hl-keyword">let</span>');
      expect(result).toContain('<span class="hl-keyword">fun</span>');
      expect(result).toContain('<span class="hl-keyword">action</span>');
    });

    it('should successfully identify and color pattern variables starting with ?', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;

      const source = 'action grow: { ?x: nat } -o { ?y: suc(?x) };';
      const result = component.tokenizeSource(source);

      expect(result).toContain('<span class="hl-var">?x</span>');
      expect(result).toContain('<span class="hl-var">?y</span>');
    });

    it('should successfully identify and color linear resource IDs starting with _', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;

      const source = '_r1: dollar; _r2: quarter;';
      const result = component.tokenizeSource(source);

      expect(result).toContain('<span class="hl-resource">_r1</span>');
      expect(result).toContain('<span class="hl-resource">_r2</span>');
    });

    it('should successfully identify and color symbols like -o, ➔, =, :, and |', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;

      const source = 'grow: { ?x: nat } -o { ?y: suc(?x) }; type color = red | blue;';
      const result = component.tokenizeSource(source);

      expect(result).toContain('<span class="hl-symbol">-o</span>');
      expect(result).toContain('<span class="hl-symbol">=</span>');
      expect(result).toContain('<span class="hl-symbol">:</span>');
      expect(result).toContain('<span class="hl-symbol">|</span>');
    });
  });

  describe('Simulation and Custom Mapping', () => {
    it('should default to explorer mode and toggle correctly', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      expect(component.activeMiddleMode()).toBe('explorer');

      component.activeMiddleMode.set('simulator');
      expect(component.activeMiddleMode()).toBe('simulator');
    });

    it('should pre-populate mapping JSON when selecting a preset', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Foxes & Rabbits Simulation is in presets
      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      const mappingVal = JSON.parse(component.simMappingJson());
      expect(mappingVal.length).toBe(2);
      expect(mappingVal[0].name).toBe('Rabbits');
      expect(mappingVal[0].literal).toBe('rabbits');
    });

    it('should set recordStorySteps defaults depending on selected preset', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // 1. Foxes & Rabbits has it off by default
      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();
      expect(component.simStoreStory()).toBe(false);

      // 2. Animals Story Mapping has it on by default
      component.selectPreset('Animals Story Mapping');
      fixture.detectChanges();
      expect(component.simStoreStory()).toBe(true);
    });

    it('should detect syntax errors in invalid mapping JSON', () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;

      component.onMappingJsonChange('invalid json {');
      expect(component.simMappingError()).toBeTruthy();

      component.onMappingJsonChange('[{"literal": "rabbits"}]'); // missing "name"
      expect(component.simMappingError()).toContain('Each mapping rule must have "name" and "literal" fields.');

      component.onMappingJsonChange('[{"name": "Rabbits", "literal": "rabbits"}]');
      expect(component.simMappingError()).toBeNull();
    });

    const waitForSimulation = async (comp: LogicExplorerComponent) => {
      return new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (!comp.simRunning()) {
            clearInterval(interval);
            resolve();
          }
        }, 5);
      });
    };

    it('should run simulation and record final state and dataPoints matching custom mapping', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      // Set small steps for fast test run
      component.simSteps.set(5);

      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      expect(component.simSummary()).toContain('Simulation finished successfully at step');
      expect(component.simDataPoints().length).toBeGreaterThan(0);
      expect(component.simFinalState().length).toBeGreaterThan(0);
    });

    it('should respect changes in the source code when compiling and running simulation', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      // Edit source code to change initial populations from 200/100 to 500/500
      const editedSource = component.rawSource()
        .replace('rabbits(200)', 'rabbits(500)')
        .replace('foxes(100)', 'foxes(500)');
      component.rawSource.set(editedSource);

      // Trigger compilation
      component.onCompileClick();
      fixture.detectChanges();

      // Set small steps
      component.simSteps.set(1);

      // Run simulation
      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      // Check the initial step data points (x=0)
      const dataPoints = component.simDataPoints();
      const initialRabbits = dataPoints.find(dp => dp.x === 0 && dp.name === 'Rabbits');
      const initialFoxes = dataPoints.find(dp => dp.x === 0 && dp.name === 'Foxes');

      expect(initialRabbits).toBeTruthy();
      expect(initialRabbits!.y).toBe(500);

      expect(initialFoxes).toBeTruthy();
      expect(initialFoxes!.y).toBe(500);
    });

    it('should respect edits when running simulation, then editing and compiling, and running simulation again', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      // 1. Run simulation once with original code (200 rabbits, 100 foxes)
      component.simSteps.set(1);
      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();
      expect(component.simDataPoints().find(dp => dp.x === 0 && dp.name === 'Rabbits')!.y).toBe(200);

      // 2. Edit source code (e.g. to 300 rabbits)
      const editedSource = component.rawSource().replace('rabbits(200)', 'rabbits(300)');
      component.rawSource.set(editedSource);

      // 3. Compile
      component.onCompileClick();
      fixture.detectChanges();

      // 4. Run simulation again
      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      // Check if it has 300 rabbits in the new simulation run
      const dataPoints = component.simDataPoints();
      const initialRabbits = dataPoints.find(dp => dp.x === 0 && dp.name === 'Rabbits');
      expect(initialRabbits!.y).toBe(300);
    });

    it('should respect edits in simulation due to auto-compile even if compile is NOT manually triggered', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      // Edit source code without compiling manually
      const editedSource = component.rawSource().replace('rabbits(200)', 'rabbits(400)');
      component.rawSource.set(editedSource);

      // Run simulation directly
      component.simSteps.set(1);
      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      // Verify that the count is updated to 400 (new value) due to auto-compile
      const dataPoints = component.simDataPoints();
      const initialRabbits = dataPoints.find(dp => dp.x === 0 && dp.name === 'Rabbits');
      expect(initialRabbits!.y).toBe(400);
    });

    it('should toggle storing story steps and respect limit in simulation', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      // Enable story recording with limit of 2 steps
      component.simStoreStory.set(true);
      component.simStoryLimit.set(2);
      component.simSteps.set(5);

      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      // Check that steps were stored, and capped at 2
      expect(component.simStorySteps().length).toBe(2);
      expect(component.simStorySteps()[0].actionMatch).toBeTruthy();
    });

    it('should not record steps when simStoreStory is disabled', async () => {
      const fixture = TestBed.createComponent(LogicExplorerComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.selectPreset('Foxes & Rabbits Simulation');
      fixture.detectChanges();

      component.simStoreStory.set(false);
      component.simSteps.set(5);

      component.runSimulation();
      await waitForSimulation(component);
      fixture.detectChanges();

      expect(component.simStorySteps().length).toBe(0);
    });
  });

  describe('Logic Syntax and Semantic Error Position TDD Suite', () => {
    let component: LogicExplorerComponent;
    let fixture: import('@angular/core/testing').ComponentFixture<LogicExplorerComponent>;
    let setEditorErrorSpy: {
      mockClear: () => void;
      mock: {
        calls: Array<[import('../monaco-js-editor/monaco-js-editor.component').EditorError | null]>;
      };
    };

    const ANIMALS_SRC = [
      'type species = cat | monkey | elephant;',
      'type item = animal(kind: species) | flower | rock | tree;',
      'type state = active(what: item) | jumpedOver(jumper: animal, target: item) | squished(jumper: item, target: item) | ranAway(who: animal);',
      'action monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };',
      'action catEscape: { ?j: jumpedOver(?any, animal(cat)) } -o { ?r: ranAway(animal(cat)) };',
      '_r1: jumpedOver(animal(monkey), flower);',
      '_r2: jumpedOver(animal(elephant), animal(cat));',
      '_r3: jumpedOver(animal(monkey), tree);',
    ];

    const PEANO_SRC = [
      'type nat = 0 | suc(num: nat);',
      'let 1 = suc(0);',
      'let 2 = suc(suc(0));',
      'let 3 = suc(suc(suc(0)));',
      'fun add(suc(?x), ?y) = suc(add(?x, ?y)) | fun add(0, ?y) = ?y;',
      'action grow: { ?x: nat } -o { ?y: suc(?x) };',
      'action doubleGrow: { ?x: nat } -o { ?y: suc(?x), ?z: suc(?x) };',
      '_r1: 0;',
      '_r2: suc(0);',
      '_r3: suc(suc(0));',
      '?y: *;',
    ];

    beforeEach(() => {
      fixture = TestBed.createComponent(LogicExplorerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const editor = component.monacoEditor();
      if (editor) {
        setEditorErrorSpy = vi.spyOn(editor, 'setEditorError') as any;
      }
    });

    const verifyErrorPosition = (source: string, expectedLine: number, expectedCol: number) => {
      setEditorErrorSpy.mockClear();
      component.compileSource(source);
      fixture.detectChanges();

      expect(setEditorErrorSpy).toHaveBeenCalled();
      const parsedError = setEditorErrorSpy.mock.calls[0][0];
      expect(parsedError).toBeTruthy();
      expect(parsedError?.start).toBeTruthy();
      expect(parsedError?.start?.line).toBe(expectedLine);
      expect(parsedError?.start?.column).toBe(expectedCol);
    };

    it('TDD: should detect keyword typo at line 4, column 1', () => {
      const lines = [...ANIMALS_SRC];
      lines[3] = 'act monkeySquish: { ?j: jumpedOver(animal(monkey), flower) } -o { ?s: squished(animal(monkey), flower) };';
      verifyErrorPosition(lines.join('\n'), 4, 1);
    });
  });
});
