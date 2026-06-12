---
name: rnaseq-qc
description: Run quality control on bulk RNA-seq data — adapter trimming, FastQC, alignment-rate checks, and a per-sample QC summary table. Use when the user has raw FASTQ files and needs a QC pass before differential expression.
domains: [bioinfo, qc]
---

# RNA-seq QC

Quality-control workflow for bulk RNA-seq before differential expression.

## Steps

1. Run `fastqc` on every FASTQ file.
2. Trim adapters with `fastp`.
3. Align and capture the alignment rate per sample.
4. Emit a per-sample QC summary table; flag samples below 70% alignment.

See `reference/thresholds.md` for the exact cutoffs.
