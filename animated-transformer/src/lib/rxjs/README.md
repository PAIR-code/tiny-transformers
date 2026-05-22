# RxJS Utilities Library

`rxjs` provides custom operators and helper wrappers on top of the reactive streams library RxJS.

## Key Operators

*   **`mapNonNull`**: A lightweight custom RxJS operator that maps values through a projection function *only* when the emitted element is not `null`. If the element is `null`, the operator skips executing the projection function and immediately propagates `null` down the stream. This prevents manual null-checking inside operators and avoids runtime crashes.

---

## Example Usage

### 1. Filtering Nulls in Mappings

```typescript
import { of } from 'rxjs';
import { mapNonNull } from './util';

// Emit values, including null
const source$ = of("hello", null, "world");

const length$ = source$.pipe(
  mapNonNull((str) => str.length) // Safely access string length
);

length$.subscribe((val) => {
  console.log(val); 
});

// Output:
// 5
// null
// 5
```
