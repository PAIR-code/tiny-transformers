
import { GTensor, DName, GVariable, GTensorOrScalar, makeScalar, GVariableOrScalar, one } from '../gtensor/gtensor';
import * as tf from '@tensorflow/tfjs';
import { BasicLmTask, Example, ExampleGenerator, generateBatch } from '../seqtasks/util';
import { GTensorTree, GVariableTree } from '../gtensor/gtensor_tree';
import { gradsVarTreeFunctor } from '../gtensor/grad';
import { BasicTaskTokenRep, StrSeqPrepFn } from '../tokens/token_gemb';
import { TrainState } from './train_state';


export class AdamOptimizer<SpecKind, ParamsKind,
  InputDims extends string, TargetDims extends string>
{
  // a is the dynamic learning rate alpha.
  public alpha: GVariable<never>;
  // The hyper-paramters for first and second moment momentum.
  public b1: GTensor<never>;
  public b2: GTensor<never>;
  public epsilon: GTensor<never>;
  public b1Inv: GTensor<never>;  // 1 - b1
  public b2Inv: GTensor<never>;  // 1 - b2
  // first and second moment momentum to the power of time, used to correct
  // for bias of 0 initialized gradients.
  public b1t: GVariable<never>;
  public b2t: GVariable<never>;
  // The first moment, per param (~ the running accumulation for the gradient)
  public m: GVariableTree<ParamsKind>;
  // The second moment, per param (~ the running accumulation for gradient^2)
  public v: GVariableTree<ParamsKind>;

  //
  constructor(
    public state: TrainState<SpecKind, ParamsKind, InputDims, TargetDims>,
    b1: number = 0.9,
    b2: number = 0.999,
    epsilon: number = 10 ** -8,
  ) {
    this.m = state.grads.map(t => new GVariable(t.zero()));
    this.v = state.grads.map(t => new GVariable(t.zero()));
    this.b1 = makeScalar(b1);
    this.b2 = makeScalar(b2);
    this.epsilon = makeScalar(epsilon);
    this.b1t = new GVariable(this.b1);
    this.b2t = new GVariable(this.b2);
    this.alpha = new GVariable(makeScalar(this.state.config.learningRate));
    this.b1Inv = makeScalar(1 - b1);
    this.b2Inv = makeScalar(1 - b2);
  }

  step() {
    if (this.state.nSteps > 0) {
      this.state.prepareNextTrainBatch()
    }

    tf.tidy(() => {
      this.b1t.assign(this.b1t.scalarMul(this.b1));
      this.b2t.assign(this.b2t.scalarMul(this.b2));
    });

    this.state.updateParamsFn(
      (p, g, i) => {
        const m = this.m.list[i] as GVariable<string>;
        const v = this.m.list[i] as GVariable<string>;
        const m2 = m.scalarMul(this.b1).pointwiseAdd(g.scalarMul(this.b1Inv));
        const v2 = v.scalarMul(this.b2).pointwiseAdd(
          g.pointwiseMul(g).scalarMul(this.b2Inv));
        m.assign(m2);
        v.assign(v2);
        const mhat = m.scalarDiv(one.scalarSub(this.b1t));
        const vhat = v.scalarDiv(one.scalarSub(this.b2t));
        const delta = mhat.pointwiseDiv(vhat.sqrt().scalarAdd(this.epsilon));
        return p.pointwiseSub(delta.scalarMul(this.alpha));
        // FASTER VERSION:
        // alpha_t = alpha * sqrt(1 – beta2_t) / (1 – beta1_t)
        // p_t = p_t – alpha_t * m_t / (sqrt(v_t) + eps)
      });
    this.state.updateGradsAndLoss();
    this.state.nSteps++;
    this.state.nExamples += this.state.batchExamples.length;
  }

  dispose() {
    this.alpha.dispose();
    this.b1t.dispose();
    this.b2t.dispose();
    this.b1.dispose();
    this.b2.dispose();
    this.b1Inv.dispose();
    this.b2Inv.dispose();
    this.epsilon.dispose();
    this.m.forEach(g => g.dispose());
    this.v.forEach(g => g.dispose());
  }
}
