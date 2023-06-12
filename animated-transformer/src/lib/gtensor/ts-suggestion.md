# Suggestion

Support set operations in types (e.g. for strings, allowing a function to add a new element to the set, require the set to not contains contain something, or to be/not-be empty, for example). Including providing a special value for the empty set; such that one can do basic set computations in the type system at checking time.

Inspired by a hack to provide a fancy type-system for [NamedTensor style of writing ML code in TFJS with TypeScript](https://github.com/PAIR-code/tiny-transformers/blob/main/animated-transformer/src/lib/README.md).

## 🔍 Search Terms

<!--
  💡 Did you know? TypeScript has over 2,000 open suggestions!
  🔎 Please search thoroughly before logging new feature requests as most common ideas already have a proposal in progress.
  The "Common Feature Requests" section of the FAQ lists many popular requests: https://github.com/Microsoft/TypeScript/wiki/FAQ#common-feature-requests

  Replace the text below:
-->

`is:issue is:open set operations label:Suggestion`
`is:issue is:open sets label:Suggestion`

## ✅ Viability Checklist

<!--
   Suggestions that don't meet all these criteria are very, very unlikely to be accepted.
   We always recommend reviewing the TypeScript design goals before investing time writing
   a proposal for ideas outside the scope of the project.
-->
My suggestion meets these guidelines:

* [x] This wouldn't be a breaking change in existing TypeScript/JavaScript code
* [x] This wouldn't change the runtime behavior of existing JavaScript code
* [x] This could be implemented without emitting different JS based on the types of the expressions
* [x] This isn't a runtime feature (e.g. library functionality, non-ECMAScript syntax with JavaScript output, new syntax sugar for JS, etc.)
* [x] This feature would agree with the rest of [TypeScript's Design Goals](https://github.com/Microsoft/TypeScript/wiki/TypeScript-Design-Goals).


## ⭐ Suggestion

When types are finite sets of strings (perhaps generalise this to atomic types?), it would be great to have a operator that acts on them. Also, it would be great to have a special type for empty set of strings, so we don't clash with the `unknown` type.



<!-- A summary of what you'd like to see added or changed -->

## 📃 Motivating Example

<!--
  If you were announcing this feature in a blog post, what's a short explanation that shows
  a developer why this feature improves the language?
-->

More details on the use-case this [TFJS RFC](https://github.com/PAIR-code/tiny-transformers/blob/main/animated-transformer/src/lib/gtensor/20210731-tfjs-named-tensors.md)


## 💻 Use Cases

<!--
  What do you want to use this for?
  What shortcomings exist with current approaches?
  What workarounds are you using in the meantime?
-->

Right now you have to write a lot of exception code, and this doesn't play well generic functions on sets (the types become these huge expressions)

* Better refactoring.
* Better type-inference.
