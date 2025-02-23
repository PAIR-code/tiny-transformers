import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-editable-markdown',
  imports: [],
  templateUrl: './editable-markdown.component.html',
  styleUrl: './editable-markdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditableMarkdownComponent {}
