/**
 * Datamations JavaScript App script
 * Reads vega lite specs, converts to vega specs and animates using gemini
 */


let rawSpecs; // holds raw vega-lite specs, not transformed
let vegaLiteSpecs;
let vegaSpecs; // vega specs, converted by gemini.vl2vg4gemini (https://github.com/uwdata/gemini#vl2vg4gemini)
let frames;
let metas;
let frameIndex = 0;
let intervalId;
let initializing = false;

const frameDuration = 2000;
// a fallback gemini spec in case gemini.animate could not find anything
const gemSpec = {
  timeline: {
    concat: [
      {
        sync: [
          {
            component: {
              mark: "marks",
            },
            change: {
              data: {
                keys: ["gemini_id"],
                update: true,
                enter: true,
                exit: false,
              },
              encode: {
                update: true,
                enter: true,
                exit: true,
              },
            },
            timing: {
              duration: {
                ratio: 1,
              },
            },
          },
        ],
      },
    ],
  },
  totalDuration: frameDuration,
};

/**
 * Resets all the instance variables
 */
const reset = () => {
  vegaLiteSpecs = [];
  vegaSpecs = [];
  rawSpecs = [];
  frames = [];
  metas = [];
  frameIndex = 0;

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
};

/**
 * Initializes datamation app
 * @param {String} id root container id where vega visualizations are mounted
 * @param {Object} param1 configuration object
 */
async function init(id, { specUrls, specs, autoPlay }) {
  // ignore all subsequent init calls.
  if (initializing) return;
  initializing = true;

  const { slider } = getSelectors(id);

  reset();

  // load or set data
  if (specs) {
    vegaLiteSpecs = JSON.parse(JSON.stringify(specs));
  } else if (specUrls) {
    vegaLiteSpecs = await loadData(specUrls);
  }

  // save raw specs to use for facet axes drawing
  vegaLiteSpecs.forEach((d) => {
    rawSpecs.push(JSON.parse(JSON.stringify(d)));

    if (d.meta) {
      metas.push(d.meta);
    }
  });

  d3.select(slider).property("max", vegaLiteSpecs.length - 1);

  // parse, jitter, layer splitting
  await transformSpecs();

  // compile to vega
  toVegaSpecs();

  // create frames for animation
  await makeFrames();

  drawSpec(0, id);

  if (autoPlay) {
    setTimeout(() => play(id), 100);
  }

  initializing = false;
}

/**
 * Plays animation
 * @param {String} id root container id where vega visualizations are mounted
 */
function play(id) {
  frameIndex = 0;
  const tick = () => {
    animateFrame(frameIndex, id);
    frameIndex++;
  };
  tick();

  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    tick();
    if (frameIndex >= frames.length) {
      clearInterval(intervalId);
      frameIndex = 0;
    }
  }, frameDuration + 100);
}

/**
 * Draws vega lite spec statically, also updates slider, description, show/hides some layers
 * @param {Number} index specification index in vegaLiteSpecs
 * @param {String} id root container id where vega visualizations are mounted
 * @returns a promise of vegaEmbed
 */
function drawSpec(index, id) {
  const spec = vegaLiteSpecs[index];

  if (!spec) return;

  const meta = metas[index];

  const { axisSelector, visSelector, descr, slider, otherLayers, controls } =
    getSelectors(id);

  d3.select(slider).property("value", index);
  d3.select(descr).html(meta.description || "frame " + index);
  d3.select(axisSelector)
    .style("opacity", meta.axes ? 1 : 0)
    .html("");
  d3.select(visSelector).classed("with-axes", meta.axes);
  d3.select(otherLayers).classed("with-axes", meta.axes);

  // draw axis
  if (meta.axes) {
    drawAxis(index, id);
  }

  // shift vis
  if (meta.transformX) {
    d3.select(visSelector).style("left", meta.transformX + "px");
  }

  d3.select(controls).style("width", spec.width + 10 + "px");

  // draw vis
  return drawChart(spec, id);
}

/**
 * Draws a chart
 * @param {Object} spec vega lite spec
 * @param {String} id root container id where vega visualizations are mounted
 * @returns a promise of vegaEmbed
 */
function drawChart(spec, id) {
  const { visSelector, otherLayers } = getSelectors(id);
  const layers = document.querySelector(otherLayers);
  layers.innerHTML = "";

  if (Array.isArray(spec)) {
    return new Promise((res) => {
      spec.forEach((s, i) => {
        let target;

        if (s.meta.animated) {
          target = visSelector;
        } else {
          const div = document.createElement("div");
          div.classList.add("vega-hidden-layer");
          layers.appendChild(div);
          target = div;
        }

        vegaEmbed(target, s, { renderer: "svg" }).then(() => {
          if (i === spec.length - 1) {
            res();
          }
        });
      });
    });
  } else {
    return vegaEmbed(visSelector, spec, { renderer: "svg" });
  }
}

/**
 * Draws an axis layer
 * @param {Number} index specification index in vegaLiteSpecs
 * @param {String} id root container id where vega visualizations are mounted
 * @returns
 */
function drawAxis(index, id) {
  let spec = rawSpecs[index];

  if (spec.spec && spec.spec.layer) {
    const split = splitLayers(spec);
    spec = split[1];
  }

  const columnFacet = spec.facet && spec.facet.column;
  const { axisSelector, controls, otherLayers } = getSelectors(id);

  // update axis domain to matched hacked facet view
  const encoding = spec.spec ? spec.spec.encoding : spec.encoding;

  if (!encoding.y.scale) {
    const extentY = d3.extent(spec.data.values, (d) => d.y);
    encoding.y.scale = { domain: extentY };
  }

  if (encoding.color) {
    encoding.color.legend = null;
  }

  if (encoding.x && encoding.x.axis) {
    encoding.x.axis.labelAngle = -90;
  }

  return vegaEmbed(axisSelector, spec, { renderer: "svg" }).then(() => {
    if (columnFacet && columnFacet.title) {
      const fn = function () {
        const transform = d3.select(this).attr("transform");
        const x = transform.split("(")[1].split(",")[0];
        return `translate(${x}, 40)`;
      };

      d3.select(axisSelector + " svg > g").attr("transform", fn);
      d3.select(otherLayers + " svg > g").attr("transform", fn);
    }
    const width = d3.select(axisSelector).node().getBoundingClientRect().width;
    d3.select(controls).style("width", width + "px");
  });
}

/**
 * Animates a frame, from source to target vega specification using gemini
 * @param {Number} index specification index in vegaLiteSpecs
 * @param {String} id root container id where vega visualizations are mounted
 * @returns a promise of gemini.animate
 */
async function animateFrame(index, id) {
  if (!frames[index]) return;

  const { axisSelector, visSelector, otherLayers, descr, slider, controls } =
    getSelectors(id);

  let { source, target, gemSpec, prevMeta, currMeta } = frames[index];
  let anim = await gemini.animate(source, target, gemSpec);
  let prevHasAxes = prevMeta.axes;
  let currHasAxes = currMeta.axes;
  let width = target.width;

  drawSpec(index, id).then(() => {
    d3.select(descr).html(currMeta.description);

    anim.play(visSelector).then(() => {
      d3.select(slider).property("value", index + 1);
    });

    if (currMeta.transformX) {
      d3.select(visSelector)
        .transition()
        .duration(750)
        .style("left", currMeta.transformX + "px");
    }

    // show/hide axis vega chart
    if (currHasAxes) {
      drawAxis(index + 1, id);
      d3.select(axisSelector).transition().duration(1000).style("opacity", 1);
      d3.select(visSelector).classed("with-axes", true);
      d3.select(otherLayers).classed("with-axes", true);
    } else {
      d3.select(axisSelector).transition().duration(1000).style("opacity", 0);
      d3.select(visSelector).classed("with-axes", false);
      d3.select(otherLayers).classed("with-axes", false);
      d3.select(controls).style("width", width + 10 + "px");
    }

    const nextSpec = vegaLiteSpecs[index + 1];

    if (nextSpec && Array.isArray(nextSpec)) {
      const statics = nextSpec.filter((d) => !d.meta.animated);

      d3.select(otherLayers)
        .html("")
        .style("opacity", 0)
        .transition()
        .delay(frameDuration / 3)
        .duration(frameDuration / 2)
        .style("opacity", 1);

      statics.forEach((s) => {
        const div = document.createElement("div");
        div.classList.add("vega-hidden-layer");
        vegaEmbed(div, s, { renderer: "svg" });
        document.querySelector(otherLayers).appendChild(div);
      });
    }
  });
}

/**
 * Loads specifications using d3.json
 * @param {Array} specUrls list of urls
 * @returns a promise of Promise.all
 */
function loadData(specUrls) {
  return Promise.all(
    specUrls.map((url) => {
      return d3.json(url);
    })
  ).catch((e) => {
    console.error(e.message);
  });
}

/**
 * Transforms specifications into proper format:
 * - meta.grid = generates infogrid
 * - meta.jitter = jitters data using d3.force
 * - spec.layer = splits layers to stack on top on each other
 */
async function transformSpecs() {
  for (let i = 0; i < vegaLiteSpecs.length; i++) {
    const vlSpec = vegaLiteSpecs[i];

    if (Array.isArray(vlSpec)) continue; // just sanity check, making sure that it is not an array

    const parse = vlSpec.meta.parse;

    // parsing
    if (parse === "grid") {
      vegaLiteSpecs[i] = await getGridSpec(vlSpec);
    } else if (parse === "jitter") {
      vegaLiteSpecs[i] = await getJitterSpec(vlSpec);
    } else if (vlSpec.layer || (vlSpec.spec && vlSpec.spec.layer)) {
      const arr = splitLayers(vlSpec);

      vegaLiteSpecs[i] = [];

      for (let j = 0; j < arr.length; j++) {
        const s = arr[j];

        // fake facets
        if (s.facet && s.spec && s.meta.animated) {
          const newSpec = await hackFacet(s);
          vegaLiteSpecs[i].push(newSpec);
          metas[i] = newSpec.meta;
        } else {
          vegaLiteSpecs[i].push(s);
        }
      }
    }

    if (vegaLiteSpecs[i]) {
      const facet = vegaLiteSpecs[i].facet;
      const spec = vegaLiteSpecs[i].spec;

      // fake facets
      if (facet && spec) {
        const newSpec = await hackFacet(vegaLiteSpecs[i]);
        vegaLiteSpecs[i] = newSpec;
      }
    }
  }
}

/**
 * Converts vega-lite to vega using vl2vg4gemini
 */
function toVegaSpecs() {
  vegaSpecs = vegaLiteSpecs.map((d) => {
    const s = Array.isArray(d) ? d.find((d) => d.meta.animated) : d;
    return gemini.vl2vg4gemini(s);
  });
}

/**
 * Generates animation frames
 */
async function makeFrames() {
  for (let i = 1; i < vegaSpecs.length; i++) {
    const prev = vegaSpecs[i - 1];
    const curr = vegaSpecs[i];

    const prevMeta = metas[i - 1];
    const currMeta = metas[i];

    try {
      const resp = await gemini.recommend(prev, curr, {
        stageN: 1,
        scales: {
          x: {
            domainDimension: "same",
          },
          y: {
            domainDimension: "same",
            signal: true,
            data: false
          },
        },
        marks: {
          marks: {
            change: {
              scale: ["x", "y"],
              data: {
                keys: ["gemini_id"],
                update: true,
                enter: true,
                exit: true,
              },
              encode: {
                update: true,
                enter: true,
                exit: true,
              },
            },
          },
        },
        totalDuration: frameDuration,
      });

      frames.push({
        source: prev,
        target: curr,
        gemSpec: resp[0] ? resp[0].spec : gemSpec,
        prevMeta,
        currMeta,
      });
    } catch (error) {
      console.error(error)
    }
  }
}

/**
 * Slider on change callback
 * @param {String} id root container id where vega visualizations are mounted
 */
function onSlide(id) {
  const { slider } = getSelectors(id);
  const index = document.querySelector(slider).value;
  drawSpec(index, id);
  if (intervalId) clearInterval(intervalId);
}