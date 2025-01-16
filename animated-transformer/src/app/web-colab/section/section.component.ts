import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Inject,
  input,
  model,
  output,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import { Experiment } from '../../../lib/weblab/experiment';
import { MarkdownModule, MarkdownService } from 'ngx-markdown';
import {
  CodemirrorConfigEditorComponent,
  ConfigUpdate,
  ConfigUpdateKind,
} from '../../codemirror-config-editor/codemirror-config-editor.component';
import { JsonValue } from 'src/lib/json/json';
import { stringifyJsonValue } from 'src/lib/json/pretty_json';
import { SetableSignal } from 'src/lib/signalspace/signalspace';
import { CellSectionComponent } from '../cell-section/cell-section.component';
import { SecDefKind, SomeSection, ViewerKind } from 'src/lib/weblab/section';

@Component({
  selector: 'app-section',
  imports: [MarkdownModule, CodemirrorConfigEditorComponent, CellSectionComponent],
  providers: [MarkdownService],
  templateUrl: './section.component.html',
  styleUrl: './section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionComponent {
  readonly edited = output<boolean>();
  readonly inView = output<boolean>();
  readonly experiment = input.required<Experiment>();
  readonly section = input.required<SomeSection>();
  // sectionTemplateRef = viewChild.required<Component>('');

  intersectionObserver: IntersectionObserver;

  SecDefKind = SecDefKind;
  ViewerKind = ViewerKind;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private thisElement: ElementRef,
  ) {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-viewport');
            this.inView.emit(true);
            // Perform actions when in view (e.g., start animation, load data)
            // element.classList.add('in-viewport'); //Add a class
          } else {
            entry.target.classList.remove('in-viewport'); //Remove the class
            this.inView.emit(false);
          }
        });
      },
      {
        root: null, // Use the viewport as the root
        rootMargin: '0px', // No margin
        threshold: 0.5, // 0.5 = Trigger when 50% of the element is visible
      },
    );
    this.intersectionObserver.observe(this.thisElement.nativeElement);
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    this.intersectionObserver.disconnect();
  }

  //
  stringifyJsonValue(x: JsonValue): string {
    return stringifyJsonValue(x);
  }

  handleJsonUpdate(update: ConfigUpdate<JsonValue>, contentSignal: SetableSignal<JsonValue>) {
    if (update.kind !== ConfigUpdateKind.UpdatedValue) {
      return;
    }
    contentSignal.set(update.obj as JsonValue);

    // TODO: sections should manage their edit status, and not have it done via
    // components.
    this.edited.emit(true);
  }

  // ngOnInit(): void {
  //   // One could get/set components dynamically, but not clear what the value is...
  //   // // Set the dynamic model sub-component, and connect it to the dataset.
  //   // const viewContainerRef = this.sectionTemplateRef();
  //   // viewContainerRef.clear();
  //   // const sectionData = this.section().data().sectionData;
  //   // switch (sectionData.sectionKind) {
  //   //   case SectionKind.Cell: {
  //   //     const componentRef = viewContainerRef.createComponent(CellSectionComponent);
  //   //     componentRef. setInput('view', this.view);
  //   //     componentRef.setInput('dataset', this.selectedDataset);
  //   //   }
  //   //   default: {
  //   //   }
  //   // }
  // }

  // readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
}
