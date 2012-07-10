view = Backbone.View.extend();

view.prototype.events = {
    'click .lots-controls a': 'resize',
    'click a[href=#wax-fullscreen]': 'fullscreen'
};

view.prototype.initialize = function() {
    _(this).bindAll(
        'render',
        'attach',
        'resize',
        'fullscreen',
        'more',
        'less',
        'syncZoom',
        'syncCenter'
    );

    this.locked = { zoom:false, center:false };
    this.map = false;
    this.maps = [];
    this.model.bind('saved', this.attach);
    this.model.bind('poll', this.attach);
    this.render().attach();
    _.each(this.maps, function(m) {
        m._windowResize();
    });
};

view.prototype.resize = function(ev) {
    var size = parseInt($(ev.currentTarget).attr('href').split('#').pop(), 10);
    while (this.maps.length < size) this.more();
    while (this.maps.length > size) this.less();
    _.each(this.maps, function(m) {
        m._windowResize();
    });
    return false;
};

view.prototype.more = function() {
    var i = this.maps.length;
    this.$('.lots').append(templates.Map('map-' + i));

    var map = new MM.Map('map-' + i,
        new wax.mm.connector(this.model.attributes));

    map.index = i;
    map.controls = {
        interaction: wax.mm.interaction()
            .map(map)
            .tilejson(this.model.attributes)
            .on(wax.tooltip()
                .parent(map.parent).events()),
        zoombox: wax.mm.zoombox(map)
    };

    var center = this.model.get('center');
    map.setCenterZoom(new MM.Location(
        center[1],
        center[0]),
        center[2] + i);
    map.setZoomRange(
        this.model.get('minzoom'),
        this.model.get('maxzoom'));
    map.addCallback('panned', _(this.syncCenter).throttle(20));
    $('.zoom-display .zoom', map.parent).text(center[2] + i);


    this.maps.push(map);
    this.$('.lots').attr('class', 'lots fill maps-' + this.maps.length);

    map.addCallback('zoomed', this.syncZoom);
    map.addCallback('extentset', this.syncZoom);
    map.addCallback('extentset', _(this.syncCenter).throttle(20));

    // If not the master map, bail here.
    if (i > 0) return;

    // Add controls to master map.
    // Add references to all controls onto the map object.
    // Allows controls to be removed later on.
    map.controls.legend = wax.mm.legend(map, this.model.attributes).appendTo(map.parent);
    map.controls.zoomer =  wax.mm.zoomer(map).appendTo($('.map').get(0));
    map.getLayerAt(0).requestManager.addCallback('requesterror', _(function(manager, url) {
        $.ajax(url, { error: _(function(resp) {
            if (resp.responseText === this._error) return;
            this._error = resp.responseText;
            new views.Modal(resp);
        }).bind(this) });
    }).bind(this));
    this.map = map;
};

view.prototype.less = function() {
    var map = this.maps.pop();
    $(map.parent).remove();
    this.$('.lots').attr('class', 'lots fill maps-' + this.maps.length);
};

view.prototype.syncZoom = function(map) {
    if (this.locked['zoom']) return;
    this.locked['zoom'] = true;
    var zoom = map.getZoom() - map.index;
    _(this.maps).each(function(m) {
        if (map !== m) m.setZoom(zoom + m.index);
        $('.zoom-display .zoom', m.parent).text(zoom + m.index);
    });
    this.locked['zoom'] = false;
};

view.prototype.syncCenter = function(map) {
    if (this.locked['center']) return;
    this.locked['center'] = true;
    var lat = map.getCenter().lat;
    var lon = map.getCenter().lon % 360;
    if (lon < -180) lon += 360; else if (lon > 180) lon -= 360;
    _(this.maps).each(function(m) {
        if (map !== m) m.setCenter(map.getCenter());
    });
    this.locked['center'] = false;
};

view.prototype.render = function() {
    if (!MM) throw new Error('ModestMaps not found.');
    $(this.el).append(templates.Lots());
    _(4).chain().range().each(this.more);
    return this;
};

view.prototype.attach = function() {
    this._error = '';
    _(this.maps).each(_.bind(function(map, index) {
        var layer = map.getLayerAt(0);
        layer.provider.options.tiles = this.model.get('tiles');
        layer.provider.options.minzoom = this.model.get('minzoom');
        layer.provider.options.maxzoom = this.model.get('maxzoom');
        layer.setProvider(layer.provider);

        layer.provider.setZoomRange(layer.provider.options.minzoom,
            layer.provider.options.maxzoom);

        map.setZoomRange(layer.provider.options.minzoom,
            layer.provider.options.maxzoom);

        map.controls.interaction.tilejson(this.model.attributes);

        // Skip control manipulations for follower maps.
        if (index) return;
        if (this.model.get('legend')) {
            map.controls.legend.content(this.model.attributes);
            map.controls.legend.appendTo($('.map').get(0));
        } else {
            $(map.controls.legend.element()).remove();
        }

        map.draw();
    }, this));
    this.$('.zoom-display .zoom').text(this.map.getZoom());
};

view.prototype.fullscreen = function(ev) {
    $('.project').toggleClass('fullscreen');
    return false;
};
