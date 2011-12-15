view = Backbone.View.extend();

view.prototype.events = {
    'click .lots-controls a': 'resize'
};

view.prototype.initialize = function() {
    _(this).bindAll(
        'render',
        'attach',
        'resize',
        'more',
        'less',
        'syncZoom',
        'syncCenter'
    );
    this.map = false;
    this.maps = [];
    this.model.bind('saved', this.attach);
    this.model.bind('poll', this.attach);
    this.render().attach();
};

view.prototype.resize = function(ev) {
    var size = parseInt($(ev.currentTarget).attr('href').split('#').pop(), 10);
    while (this.maps.length < size) this.more();
    while (this.maps.length > size) this.less();
    return false;
};

view.prototype.more = function() {
    if (!com.modestmaps) throw new Error('ModestMaps not found.');

    var i = this.maps.length;
    this.$('.lots').append(templates.Map('map-'+i));

    var map = new com.modestmaps.Map('map-'+i,
        new wax.mm.connector(this.model.attributes));

    var center = this.model.get('center');
    map.setCenterZoom(new com.modestmaps.Location(
        center[1],
        center[0]),
        center[2] + i);
    map.addCallback('panned', _(this.syncCenter).throttle(20));
    $('.zoom-display .zoom', map.parent).text(center[2] + i);

    this.maps.push(map);
    this.$('.lots').attr('class', 'lots fill maps-' + this.maps.length);

    // If not the master map, bail here.
    if (i > 0) return;

    // Add controls to master map.
    // Add references to all controls onto the map object.
    // Allows controls to be removed later on.
    map.controls = {
        interaction: wax.mm.interaction(map, this.model.attributes),
        legend: wax.mm.legend(map, this.model.attributes),
        zoomer: wax.mm.zoomer(map).appendTo(map.parent),
        zoombox: wax.mm.zoombox(map)
    };
    map.requestManager.addCallback('requesterror', _(function(manager, url) {
        $.ajax(url, { error: _(function(resp) {
            if (resp.responseText === this._error) return;
            this._error = resp.responseText;
            new views.Modal(resp);
        }).bind(this) });
    }).bind(this));
    map.addCallback('zoomed', this.syncZoom);
    map.addCallback('extentset', this.syncZoom);
    map.addCallback('extentset', _(this.syncCenter).throttle(20));
    this.map = map;
};

view.prototype.less = function() {
    var map = this.maps.pop();
    $(map.parent).remove();
    this.$('.lots').attr('class', 'lots fill maps-' + this.maps.length);
};

view.prototype.syncZoom = function(map) {
    _(this.maps).each(function(m, i) {
        var z = map.getZoom() + i;
        if (map !== m) m.setZoom(z);
        $('.zoom-display .zoom', m.parent).text(z);
    });
};

view.prototype.syncCenter = function(map) {
    var lat = map.getCenter().lat;
    var lon = map.getCenter().lon % 360;
    if (lon < -180) lon += 360; else if (lon > 180) lon -= 360;

    // Sync map centers.
    _(this.maps).each(function(m, i) {
        if (map !== m) m.setCenter(map.getCenter());
    });

    // Set model center.
    if (this.map === map)
        this.model.set({center:[lon, lat, map.getZoom()]}, {silent:true});
};

view.prototype.render = function() {
    if (!com.modestmaps) throw new Error('ModestMaps not found.');
    $(this.el).append(templates.Lots());
    _(4).chain().range().each(this.more);
    return this;
};

view.prototype.attach = function() {
    this._error = '';
    _(this.maps).each(function(map, index) {
        map.provider.options.tiles = this.model.get('tiles');
        map.provider.options.minzoom = this.model.get('minzoom');
        map.provider.options.maxzoom = this.model.get('maxzoom');
        map.setProvider(map.provider);

        // Skip control manipulations for follower maps.
        if (index) return;

        map.controls.interaction.remove();
        map.controls.interaction = wax.mm.interaction(map, this.model.attributes);

        if (this.model.get('legend')) {
            map.controls.legend.content(this.model.attributes);
            map.controls.legend.appendTo(this.map.parent);
        } else {
            $(map.controls.legend.element()).remove();
        }
    }.bind(this));
};

// Hook in to project view with an augment.
views.Project.augment({ render: function(p) {
    p.call(this);
    new views.Map({
        el:this.$('.map'),
        model:this.model
    });
    return this;
}});

