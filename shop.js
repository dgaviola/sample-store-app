var model = null;
$(document).ready(function() {
    sys.ws.API_URL = 'https://storeapp.slingrs.io/dev/runtime/api';
    sys.ws.TOKEN = 'FMKamaruMV4vWlAB8xhnVjNm9T4ehsuk';

    var Model = function() {
        var self = this;

        self.loading = ko.observable(true);
        self.products = ko.observable([]);

        self.loadProducts = function() {
            self.loading(true);
            sys.ws.get('/data/products', function(res) {
                var products = [];
                res.items.forEach(function(item) {
                    var product = new Product();
                    product.fromJson(item);
                    products.push(product);
                });
                self.products(products);
                self.loading(false);
            }, function(error) {
                console.error('There was an error loading products');
                self.loading(false);
            });
        };

        self.init = function() {
            self.loadProducts();
        };

        return self;
    };

    var Product = function() {
        var self = this;

        self.id = ko.observable();
        self.name = ko.observable();
        self.description = ko.observable();
        self.price = ko.observable();

        self.fromJson = function(json) {
            self.id(json.id);
            self.name(json.name);
            self.description(json.description);
            self.price(json.price);
        };

        self.buy = function() {
            window.location.href = '/checkout?product='+self.id();
        };

        return self;
    };

    model = new Model();
    ko.applyBindings(model);
    model.init();
});