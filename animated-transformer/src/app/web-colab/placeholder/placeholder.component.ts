import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AutoCompletedTextInputComponent } from 'src/app/auto-completed-text-input/auto-completed-text-input.component';
import { Section } from 'src/lib/weblab/section';

enum SecKinds {
  Markdown = 'Markdown',
  Json = 'Json',
  InlineCode = 'Inline Code',
  RemoteCode = 'Remote Code',
}
type SecKindsStrings = `${SecKinds}`;

@Component({
  selector: 'app-placeholder',
  imports: [
    AutoCompletedTextInputComponent,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
  ],
  templateUrl: './placeholder.component.html',
  styleUrl: './placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  readonly section = input.required<Section>();
  secKindsList = Object.values(SecKinds);
  kind = signal<SecKinds | null>(null);

  SecKinds = SecKinds;

  constructor() {}

  selectKind(kind: string | null) {
    this.kind.set(kind as SecKinds | null);
    console.log(`this.kind.set`);
  }

  turnIntoJsonCell() {
    if (this.kind() !== SecKinds.Json) {
      throw new Error(`Can't create JSON when kind is: ${this.kind()}`);
    }
  }

  turnIntoRemoteCodeCell() {
    if (this.kind() !== SecKinds.RemoteCode) {
      throw new Error(`Can't create RemoteCode cell when kind is: ${this.kind()}`);
    }
  }
}
