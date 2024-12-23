import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-token-seq-display',
    imports: [],
    templateUrl: './token-seq-display.component.html',
    styleUrl: './token-seq-display.component.scss'
})
export class TokenSeqDisplayComponent {
  @Input() tokens: string[] = [];
}
