# Reference: API

A small example reference file. The numbers and options below are made up to
show how a reference table renders.

## Options

| Option       | Type     | Default | Description                          |
| ------------ | -------- | ------- | ------------------------------------ |
| `title`      | string   | `""`    | Heading shown at the top of the guide |
| `depth`      | number   | `3`     | Maximum section nesting level         |
| `callouts`   | boolean  | `true`  | Whether to render pitfall callouts    |
| `format`     | enum     | `md`    | Output format: `md`, `html`          |

## Example

```bash
sample-guide build --title "Getting Started" --depth 2 --format html
```
