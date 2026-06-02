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
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('LogicExplorerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
      ],
      imports: [NoopAnimationsModule, LogicExplorerComponent],
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
});
