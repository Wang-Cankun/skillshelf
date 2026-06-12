---
name: scrna-cluster
description: >-
  Cluster single-cell RNA-seq data and annotate cell types. Older copy that also
  ran batch integration with Harmony before clustering. Drifted from the bioinfo
  canonical version — kept here by an old project move.
domains: [bioinfo, scrna, coding]
---

# scRNA clustering (drifted copy)

This copy adds a Harmony batch-integration step the canonical version dropped.

1. Normalize and log1p.
2. Select highly variable genes.
3. Harmony batch integration.
4. PCA, neighbors graph, Leiden clustering.
5. Rank marker genes per cluster, annotate cell types.
