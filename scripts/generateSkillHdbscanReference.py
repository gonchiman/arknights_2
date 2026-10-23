"""Regenerate independent HDBSCAN golden partitions; not needed by npm test.

Run with scikit-learn==1.7.2. The committed JSON records all input vectors and
reference labels so normal application development does not require Python.
"""
import json
import math
from pathlib import Path

import numpy as np
import scipy
import sklearn
from sklearn.cluster import HDBSCAN
from sklearn.cluster._hdbscan import hdbscan as sklearn_hdbscan
from sklearn.cluster._hdbscan._linkage import make_single_linkage

if sklearn.__version__ != "1.7.2":
    raise RuntimeError("This reference requires scikit-learn==1.7.2")


def angular(values):
    return [[math.cos(value), math.sin(value)] for value in values]


def normalize(rows):
    return [[float(value / np.linalg.norm(row)) for value in row] for row in rows]


rng = np.random.default_rng(7401)
clouds = []
for center, width, count in [([1, .08, .1], .015, 13), ([.9, .3, .1], .04, 12),
                              ([.12, 1, .08], .02, 16), ([.1, .2, 1], .09, 10)]:
    clouds.extend(np.maximum(.001, rng.normal(center, width, (count, 3))).tolist())
clouds.extend(rng.uniform(.1, 1, (9, 3)).tolist())

cases = [
    ("two-clusters-and-outliers", angular([.01, .013, .018, .025, .032, .85, .862, .874, .887, .90, 1.4, .4]), [(3, 3), (4, 2), (6, 3)]),
    ("variable-density", normalize(clouds), [(4, 3), (6, 5), (10, 8), (20, 10)]),
    ("nested-density", angular([.1 + value * .004 for value in range(8)]
                              + [.18 + value * .004 for value in range(8)]
                              + [.14, .15, .16, .17, .19, .2, .21]
                              + [.9 + value * .007 for value in range(10)]), [(4, 3), (6, 4), (9, 3)]),
    ("duplicates", [[1., 0., 0.]] * 5 + [[0., 1., 0.]] * 4 + [[0., 0., 1.]] * 3 + normalize([[1., 1., 1.]]), [(2, 1), (3, 3), (4, 4)]),
    ("all-identical", [[.6, .8]] * 9, [(2, 1), (3, 3), (5, 5)]),
    ("equal-distances", np.eye(8).tolist(), [(2, 1), (2, 3), (4, 8)]),
    ("minimum-samples-includes-self", angular([.01, .02, .3, .31, 1.1, 1.13]), [(2, 1), (2, 2), (2, 3), (2, 6)]),
    ("minimum-cluster-larger-than-input", angular([.1, .2, .8, .9]), [(5, 2)]),
]

fixtures = []
default_process_mst = sklearn_hdbscan._process_mst


def stable_process_mst(edges):
    # NumPy's default quicksort can rearrange equal-weight MST edges. Binary
    # linkage at a tied split can consequently assign boundary points differently.
    # Keep sklearn's MST, linkage, condensation, stability and extraction intact;
    # explicitly use the same deterministic tie order as the TypeScript engine.
    return make_single_linkage(edges[np.argsort(edges["distance"], kind="stable")])


def canonical(labels):
    mapping = {}
    return [int(label) if label < 0 else mapping.setdefault(int(label), len(mapping)) for label in labels]


for name, rows, settings in cases:
    samples = np.array(rows, dtype=np.float64)
    # Direct differences match the requested Euclidean metric without dot-product
    # cancellation for identical/near-identical normalized sparse TF-IDF vectors.
    distances = np.sqrt(np.sum((samples[:, None, :] - samples[None, :, :]) ** 2, axis=2))
    runs = []
    for minimum, neighbors in settings:
        for method in ["eom", "leaf"]:
            estimator = HDBSCAN(min_cluster_size=minimum, min_samples=neighbors,
                                cluster_selection_method=method, metric="precomputed",
                                algorithm="brute", alpha=1., cluster_selection_epsilon=0.,
                                allow_single_cluster=False, copy=True)
            sklearn_hdbscan._process_mst = default_process_mst
            default_labels = estimator.fit_predict(distances)
            sklearn_hdbscan._process_mst = stable_process_mst
            labels = estimator.fit_predict(distances)
            run = {"config": {"minClusterSize": minimum, "minSamples": neighbors,
                              "clusterSelectionMethod": method}, "labels": default_labels.tolist()}
            # Public, unmodified sklearn labels remain the primary golden result.
            # Supplemental results isolate ordering sensitivity without changing
            # any distance, MST edge weight, condensation or extraction formula.
            sensitive = [index for index, (first, second) in enumerate(zip(canonical(default_labels), canonical(labels))) if first != second]
            if sensitive:
                run["stable_sort_labels"] = labels.tolist()
                run["tie_sensitive_indices"] = sensitive
            runs.append(run)
    fixtures.append({"name": name, "vectors": rows, "runs": runs})

output = Path(__file__).resolve().parents[1] / "tests/fixtures/skillHdbscan.sklearn-1.7.2.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({"reference": {"package": "scikit-learn", "version": sklearn.__version__,
                                          "numpy_version": np.__version__, "scipy_version": scipy.__version__,
                                          "metric": "precomputed Euclidean", "algorithm": "brute",
                                          "alpha": 1, "cluster_selection_epsilon": 0,
                                          "mst_tie_order": "NumPy default (unmodified public estimator)",
                                          "supplemental_mst_tie_order": "stable Prim discovery order; only _process_mst sorting is changed",
                                          "allow_single_cluster": False, "min_samples_includes_self": True},
                             "cases": fixtures}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(fixtures)} data sets / {sum(len(case['runs']) for case in fixtures)} runs to {output}")
