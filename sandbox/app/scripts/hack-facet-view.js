function getSpecTemplate(width, height, axes = { x: true, y: true }, spec) {
  const encoding = spec.spec.encoding;
  const mark = spec.spec.mark;
  const facet = spec.facet;
  
  if (encoding.x) {
    const title = facet && facet.column ? facet.column.title : null;

    encoding.x = {
      field: "x",
      type: "quantitative",
      scale: {},
      axis: axes.x ? {
        labelExpr: "",
        values: [],
        title: title,
        grid: false,
        orient: "top",
        ticks: false,
        domain: false,
        labelPadding: 10
      } : null,
    }
  }

  if (encoding.y) {
    const title = facet && facet.row ? facet.row.title : null;

    encoding.y = {
      field: spec.spec.mark === "errorbar" ? encoding.y.field : "y",
      type: "quantitative",
      scale: {},
      axis: axes.y ? {
        labelExpr: "",
        values: [],
        title: title,
        grid: false,
        labelAngle: 90,
        domain: false,
        ticks: false, 
        labelPadding: 10,
        orient: "right"
      } : null,
    }
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v4.json",
    data: {
      values: [],
    },
    width: width,
    height: height,
    mark: mark,
    encoding: encoding
  };
}

function getHackedSpec({ view, spec, width = 600, height = 600 }) {
  const rowId = spec.facet.row ? spec.facet.row.field : null;
  const colId = spec.facet.column ? spec.facet.column.field : null;

  const newSpec = getSpecTemplate(
    width, 
    height, 
    {  
      x: colId,
      y: rowId,
    },
    spec
  );

  const yDomain = [height, 0];
  const xDomain = [0, width];

  const values = [];

  const colMap = new Map();
  const rowMap = new Map();

  const scaleX = view.scale("x");
  const scaleY = view.scale("y");
  const source = view.data("source");

  // need y axis
  if (rowId) {
    const row_header = view.data("row_header");
    const yAxisValues = [];
    const yAxisExpr = {};

    row_header.forEach((d) => {
      const bounds = d.bounds;
      const name = d.datum[rowId];
      const y1 = bounds.y1;
      const y2 = bounds.y2;

      rowMap.set(name, y1);
  
      const yCoord = Math.round(y1 + (y2 - y1) / 2);
  
      yAxisValues.push(yCoord);
      yAxisExpr[yCoord] = name;
    });

    yDomain[1] = d3.min(row_header, d => d.bounds.y1);
    yDomain[0] = d3.max(row_header, d => d.bounds.y2);

    newSpec.encoding.y.axis.values = yAxisValues;
    newSpec.encoding.y.axis.labelExpr = `${JSON.stringify(yAxisExpr)}[datum.label]`;
  }

  // need x axis
  if (colId) {
    const column_header = view.data("column_header");
    const xAxisValues = [];
    const xAxisExpr = {};

    column_header.forEach((d, i) => {
      const bounds = d.bounds;

      const name = d.datum[colId];
      colMap.set(name, bounds.x1);

      const xCoord = Math.round(bounds.x1 + (bounds.x2 - bounds.x1) / 2);

      xAxisValues.push(xCoord);
      xAxisExpr[xCoord] = name;
    });

    xDomain[0] = d3.min(column_header, d => d.bounds.x1) 
    xDomain[1] = d3.max(column_header, d => d.bounds.x2);

    newSpec.encoding.x.axis.values = xAxisValues;
    newSpec.encoding.x.axis.labelExpr = `${JSON.stringify(xAxisExpr)}[datum.label]`;
  }

  source.forEach((d) => {
    const col = d[colId];
    const row = d[rowId];

    const xStart = colMap.get(col) || 0;
    const yStart = rowMap.get(row) || 0;

    values.push({
      ...d,
      x: xStart + scaleX(d.x),
      y: (yStart + scaleY(d.y)),
    });
  });

  newSpec.encoding.x.scale.domain = xDomain;
  newSpec.encoding.y.scale.domain = yDomain;
  newSpec.data.values = values;
  newSpec.width = xDomain[1];
  newSpec.height = yDomain[0];

  return newSpec;
}

function hackFacet(spec) {
  const div = document.createElement("div");

  spec.data.name = "source";

  return vegaEmbed(div, spec, {renderer: "svg"}).then(resp => {
    const newSpec = getHackedSpec({
      ...resp,
      width: spec.spec.width,
      height: spec.spec.height,
    });

    if (spec.config) {
      newSpec.config = spec.config;
    }

    if (spec.meta) {
      newSpec.meta = spec.meta;
    }

    const transformX = resp.view._origin[0];
    console.log(transformX);
    if (newSpec.meta) {
      newSpec.meta.transformX = transformX
    } else {
      newSpec.meta = { transformX };
    }

    return newSpec;
  });
}