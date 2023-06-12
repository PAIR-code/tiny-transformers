// Working with Metrics for populations and samples.
//
// TODO: playing with fire; add tests.

// export interface VegaPoint {
//   step: number;
//   loss: number;
//   name: string;
// }

/*
export interface MetaData {
  tick: number;
  name: string;
}

export interface SampleMean {
  size: number;
  mean: number;
}

export interface PopulationMetric {
  samplesMeans: { [sample: string]: SampleMean };
}

export interface SampleMean {
  size: number;
  mean: number;
}

export class Metrics {
  public static ALL_POPULATIONS_NAME = '*';

  populations: { [population: string]: PopulationMetric } = {};
  allPopulations: PopulationMetric = { samplesMeans: {} };

  constructor(public metadata: MetaData) { }

  // _makeAggregatePopulationsMetric() {
  //   this.allPopulations = Object.values(this.populations).reduce(reduceLeftPopulationMetrics,
  //     {} as PopulationMetric);
  // }

  // Add a new samplemean, updating allPopulations.
  addSampleMean(populationName: string, sampleName: string, sampleMean: SampleMean) {
    if (populationName === Metrics.ALL_POPULATIONS_NAME) {
      throw new Error(`addSampleMean: ${populationName} is a reserved population name.`);
    }

    if (!(populationName in this.populations)) {
      this.populations[populationName] = { samplesMeans: {} };
    } else if (sampleName in this.populations[populationName].samplesMeans) {
      throw new Error(`addSampleMean: ${sampleName} already existings in ${populationName}.`);
    }

    this.populations[populationName].samplesMeans[sampleName] = sampleMean;

    if (!(sampleName in this.allPopulations.samplesMeans)) {
      this.allPopulations.samplesMeans[sampleName] = Object.assign({}, sampleMean);
    } else {
      this.allPopulations.samplesMeans[sampleName] = combineSampleMeans(
        this.allPopulations.samplesMeans[sampleName], sampleMean);
    }
  }

  makeVegaPoints(): VegaPoint[] {
    let vegaPoints: VegaPoint[] = [];

    vegaPoints = vegaPoints.concat(vegaPointsFromPop(
      this.metadata.tick, Metrics.ALL_POPULATIONS_NAME, this.allPopulations));

    Object.keys(this.populations).forEach((popName: string) =>
      vegaPoints = vegaPoints.concat(
        vegaPointsFromPop(this.metadata.tick, popName, this.populations[popName])));

    return vegaPoints;
  }
}

// // Combines metrics for populations that have happened at the same time-point.
// // name from first.
// function reduceLeftPopulationMetrics(
//   acc: PopulationMetric, cur: PopulationMetric): PopulationMetric {
//   Object.keys(cur).forEach((sampleName) => {
//     if (sampleName in acc) {
//       combineSampleMeans(acc[sampleName], cur[sampleName]);
//     } else {
//       acc[sampleName] = Object.assign({}, cur[sampleName]);
//     }
//   });
//   return acc;
// }

// Combines metrics for populations that have happened at the same time-point.
// name from first.
function combineSampleMeans(m1: SampleMean, m2: SampleMean): SampleMean {
  const sizeSum = m1.size + m2.size;
  return {
    size: sizeSum,
    mean: m1.mean * (m1.size / sizeSum) + m2.mean * (m2.size / sizeSum),
  };
}

function vegaPointsFromPop(tick: number, popName: string, popMetric: PopulationMetric): VegaPoint[] {
  const vegaPoints: VegaPoint[] = [];
  Object.keys(popMetric.samplesMeans).forEach(
    (sampleName: string) => vegaPoints.push({
      x: tick,
      y: popMetric.samplesMeans[sampleName].mean,
      name: `${popName}.${sampleName}`,
    }));
  return vegaPoints;
}

*/
