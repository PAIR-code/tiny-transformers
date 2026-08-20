/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, ChangeDetectionStrategy, input, output, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ConfigFieldDef, ConfigFieldType, ConfigFieldNumberDef, ConfigFieldSelectDef } from '../models/char-learner';

@Component({
  selector: 'app-model-config-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './model-config-editor.component.html',
  styleUrls: ['./model-config-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closePopup()' }
})
export class ModelConfigEditorComponent {
  configDefs = input.required<ConfigFieldDef[]>();
  configValues = input.required<Record<string, any>>();
  
  // Two-way binding for active popup to share popup state with parent if needed, 
  // or just manage it locally.
  activePopup = model<string | null>(null);

  valueChange = output<{ key: string; value: any; requiresRebuild: boolean }>();

  // Expose enum to template
  readonly ConfigFieldType = ConfigFieldType;

  closePopup() {
    this.activePopup.set(null);
  }

  togglePopup(id: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (this.activePopup() === id) {
      this.activePopup.set(null);
    } else {
      this.activePopup.set(id);
    }
  }

  onNumberChange(def: ConfigFieldNumberDef, event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    const normalized = rawValue.replace(',', '.');
    const parsed = parseFloat(normalized);
    const val = isNaN(parsed) ? (def.defaultValue ?? 0) : parsed;
    
    this.valueChange.emit({
      key: def.key,
      value: val,
      requiresRebuild: !!def.requiresRebuild
    });
  }

  onSelectChange(def: ConfigFieldSelectDef, event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.valueChange.emit({
      key: def.key,
      value: val,
      requiresRebuild: !!def.requiresRebuild
    });
  }

  // Cast helpers for strict template checking
  asNumberDef(def: ConfigFieldDef): ConfigFieldNumberDef {
    return def as ConfigFieldNumberDef;
  }
  
  asSelectDef(def: ConfigFieldDef): ConfigFieldSelectDef {
    return def as ConfigFieldSelectDef;
  }
}
