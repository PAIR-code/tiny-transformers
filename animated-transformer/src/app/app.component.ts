/* Copyright 2023 Google LLC. All Rights Reserved.

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

import { Component } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule } from '@angular/forms';
import { MatSidenavModule } from '@angular/material/sidenav';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    RouterLink,
    RouterOutlet,
    MatSidenavModule,
    // ---
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatListModule,
    FormsModule,
  ],
})
export class AppComponent {
  constructor(
    private route: ActivatedRoute,
    public router: Router,
  ) {}

  async loadExperiment() {
    const dirHandle = await self.showDirectoryPicker({ mode: 'readwrite' });
    const projectFile = await dirHandle.getFileHandle('project.json', {
      create: true,
    });

    // const writable = await projectFile.createWritable();
    // await writable.write('hello there');
    // await writable.close();
    // console.log(dirHandle.name);
    // console.log(dirHandle.getFileHandle(''));

    for await (const entry of dirHandle.values()) {
      const perm = await entry.requestPermission({ mode: 'read' });
      console.log(entry.kind, entry.name, perm);
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const dec = new TextDecoder('utf-8');
        console.log('file contains:', dec.decode(await file.arrayBuffer()));
      }
    }
  }
}
