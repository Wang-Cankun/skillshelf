---
name: scrna-cluster
description: >-
  Cluster single-cell RNA-seq data and annotate cell types. Covers normalization,
  HVG selection, PCA, neighbors, Leiden clustering, and marker-gene-based
  annotation. Use when the user has a cell-by-gene matrix and wants cell-type
  clusters.
domains: [bioinfo, scrna]
---

# scRNA clustering

Standard Scanpy clustering + annotation pipeline.

## Steps

1. Normalize and log1p.
2. Select highly variable genes.
3. PCA, neighbors graph, Leiden clustering.
4. Rank marker genes per cluster, annotate cell types.
