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

import { inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

export function addIcons(names: string[]) {
  const iconRegistry = inject(MatIconRegistry);
  const sanitizer = inject(DomSanitizer);
  for (const name of names) {
    iconRegistry.addSvgIcon(
      name,
      sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${name}.svg`),
    );
  }
}
