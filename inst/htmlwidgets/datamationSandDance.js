HTMLWidgets.widget({
    name: "datamationSandDance",

    type: "output",

    factory: function (el, width, height) {
        return {

            renderValue: function (x) {
                window.app = App(el.id, {specs: x.specs, autoPlay: true});
            },

            resize: function (width, height) { },
        };
    },
});
