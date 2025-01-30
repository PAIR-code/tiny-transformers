import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AutoCompletedTextInputComponent } from 'src/app/auto-completed-text-input/auto-completed-text-input.component';

enum SecKinds {
  Markdown = 'Markdown',
  Json = 'Json',
  InlineCode = 'Inline Code',
  RemoteCode = 'Remote Code',
}

@Component({
  selector: 'app-placeholder',
  imports: [AutoCompletedTextInputComponent],
  templateUrl: './placeholder.component.html',
  styleUrl: './placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderComponent {
  secKindsList = Object.keys(SecKinds);

  constructor() {}

  selectKind(kind: string | null) {
    console.warn(`not yet implemented selectKind(${kind})`);
  }
}
