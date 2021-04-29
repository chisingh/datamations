function getSpecTemplate(width, height, axes = { x: true, y: true }, encoding) {
  if (encoding.x) {
    encoding.x = {
      field: "x",
      type: "quantitative",
      scale: {},
      axis: axes.x ? {
        labelExpr: "",
        values: [],
        title: false,
        grid: false,
        orient: "top",
        ticks: false,
        domain: false,
        labelPadding: 7
      } : null,
    }
  }

  if (encoding.y) {
    encoding.y = {
      field: "y",
      type: "quantitative",
      scale: {},
      axis: axes.y ? {
        labelExpr: "",
        values: [],
        title: false,
        grid: false,
        labelAngle: -90,
        domain: false,
        ticks: false,
        labelPadding: 7
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
    mark: "point",
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
    spec.spec.encoding
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
  
      const yCoord = (y1 + (y2 - y1) / 2);
  
      yAxisValues.push(yCoord);
      yAxisExpr[yCoord] = name;
    });

    yDomain[1] = d3.min(row_header, d => d.bounds.y1) - 20;
    yDomain[0] = d3.max(row_header, d => d.bounds.y2) + 20;

    newSpec.encoding.y.axis.values = yAxisValues;
    newSpec.encoding.y.axis.labelExpr = `${JSON.stringify(yAxisExpr)}[datum.label]`;
  }

  // need x axis
  if (colId) {
    const column_header = view.data("column_header");
    const xAxisValues = [];
    const xAxisExpr = {};

    column_header.forEach((d) => {
      const bounds = d.bounds;
      const name = d.datum[colId];
      colMap.set(name, bounds.x1);

      const xCoord = bounds.x1 + (bounds.x2 - bounds.x1) / 2;

      xAxisValues.push(xCoord);
      xAxisExpr[xCoord] = name;
    });

    xDomain[0] = d3.min(column_header, d => d.bounds.x1) - 20
    xDomain[1] = d3.max(column_header, d => d.bounds.x2) + 20;

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

  return newSpec;
}

function hackFacet(spec, width = 600, height = 600) {
  const div = document.createElement("div");

  return vegaEmbed(div, spec, {renderer: "svg"}).then(resp => {
    const newSpec = getHackedSpec({
      view: resp.view,
      spec: resp.spec,
      width: width,
      height: height
    });
    
    return newSpec;
  });
}