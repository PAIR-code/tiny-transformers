
// function listSubst<N extends string>(
//   p: Template<N>, l: { [Key in N]: string }[], joinStr: string): string {
//   return l.map(e => p.substs(e).escaped).join(joinStr);
// }


// function numberedListSubst<N extends string>(
//   p: Template<N | 'number'>, l: { [Key in N]: string }[],
//   joinStr: string,
//   numberToStrFn: (n: number) => string = n => `${n}`): string {
//   return l.map((e, i) =>
//     p.substs({ ...e, number: numberToStrFn(i) }).escaped).join(joinStr);
// }


  // concat<MoreVarNs extends string>(
  //   examples: { [Key in Ns]: string | NamedVar<MoreVarNs> }[]
  // ): FewShotTempl<Ns, VarNs | MoreVarNs> {
  //   type ConcatExamples = { [Key in Ns]: string | NamedVar<VarNs | MoreVarNs> }[];
  //   const conatExamples = this.examples as ConcatExamples;
  //   return new FewShotTempl(this.template, this.joinStr,
  //     conatExamples.concat(examples));
  // }
