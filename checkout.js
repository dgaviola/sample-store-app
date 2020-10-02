var STRIPE_PUBLIC_KEY = 'pk_test_51HXRmhH9GxJBMXDdPPWvFdXjmcovKV9O7FaAa9o3glBLPSjVSfwbdgioJestcVheLphh1Cfc8VQ1JvsMei7hcTcw00T2WsMZSN';
var model = null;
$(document).ready(function() {
    sys.ws.API_URL = 'https://storeapp.slingrs.io/dev/runtime/api';
    sys.ws.TOKEN = 'FMKamaruMV4vWlAB8xhnVjNm9T4ehsuk';

    var Model = function() {
        var self = this;

        self.productId = ko.observable();
        self.productName = ko.observable();
        self.productPrice = ko.observable();
        self.productInfoEnabled = ko.observable(false);
        self.quantity = ko.observable(1);
        self.total = ko.computed(function() {
            return self.productPrice() * self.quantity();
        });

        self.firstName = ko.observable();
        self.lastName = ko.observable();
        self.email = ko.observable();
        self.existingUser = ko.observable(false);

        self.shippingAddressLine1 = ko.observable();
        self.shippingAddressLine2 = ko.observable();
        self.shippingCity = ko.observable();
        self.shippingState = ko.observable();
        self.shippingZipCode = ko.observable();

        self.billingNameOnCard = ko.observable();
        self.billingEmail = ko.observable();
        self.billingSameAsShipping = ko.observable(true);
        self.billingAddressLine1 = ko.observable();
        self.billingAddressLine2 = ko.observable();
        self.billingCity = ko.observable();
        self.billingState = ko.observable();
        self.billingZipCode = ko.observable();

        self.stripe = null;
        self.elements = null;
        self.card = null;
        self.paymentIntentClientSecret = null;

        self.paymentError = ko.observable();
        self.generalError = ko.observable();
        self.submitting = ko.observable(false);
        self.showForm = ko.observable(true);
        self.showSuccess = ko.observable(false);

        self.confirmOrder = function() {
            // we need to create the payment intent
            self.paymentError(null);
            self.generalError(null);
            self.submitting(true);
            sys.ws.put('/data/orders/quote', {
                product: self.productId(),
                quantity: self.quantity(),
                zipCode: self.billingSameAsShipping() ? self.shippingZipCode() : self.billingZipCode(),
                createPaymentIntent: true
            }, function (res) {
                self.paymentIntentClientSecret = res.paymentIntent.clientSecret;
                var confirmData = {
                    payment_method: {
                        card: self.card,
                        billing_details: {
                            name: self.billingNameOnCard(),
                            email: self.billingEmail()
                        }
                    }
                };
                if (!self.existingUser()) {
                    confirmData.setup_future_usage = 'on_session';
                }
                self.stripe.confirmCardPayment(res.paymentIntent.clientSecret, confirmData, {
                    handleActions: false
                }).then(function (result) {
                    if (result.error) {
                        self.paymentError(result.error.message);
                        console.error(result.error.message);
                        self.submitting(false);
                    } else {
                        if (result.paymentIntent.status == 'requires_action') {
                            console.error('3DS not implemented');
                        } else {
                            self.verifyPaymentIntent(result.paymentIntent);
                        }
                    }
                });
            }, function (errorInfo) {
                if (errorInfo.code == 'validationErrors') {
                    var errorMessage = 'There are validation errors:<br/>';
                    errorInfo.errors.forEach(function(error) {
                        errorMessage += error.fieldLabel+': '+error.message+'<br/>';
                    });
                    self.generalError(errorMessage);
                } else {
                    self.generalError('There was a problem initiating the payment. Your card has not been charged. Please, contact support');
                    console.error('Error making quote and creating payment intent');
                    console.error(errorInfo);
                }
                self.submitting(false);
            });
        };

        self.verifyPaymentIntent = function (paymentIntent) {
            if (paymentIntent.status == 'requires_action') {
                self.paymentError('Validation did not succeed. Please, try again.');
                self.submitting(false);
            } else if (paymentIntent.status === 'succeeded') {
                // now, we place the order on adx
                var billingInfo = {

                    email: self.billingEmail().trim(),
                };
                if (!self.billingSameAsShipping()) {
                    self.billingAddressLine1(self.shippingAddressLine1().trim());
                    self.billingAddressLine2(self.shippingAddressLine2());
                    self.billingCity(self.shippingCity().trim());
                    self.billingState(self.shippingState());
                    self.billingZipCode(self.shippingZipCode().trim());
                }

                var order = {
                    product: self.productId(),
                    quantity: self.quantity(),
                    firstName: self.firstName().trim(),
                    lastName: self.lastName().trim(),
                    email: self.email().trim(),
                    shippingAddress: {
                        addressLine1: self.shippingAddressLine1().trim(),
                        addressLine2: self.shippingAddressLine2(),
                        city: self.shippingCity().trim(),
                        state: self.shippingState(),
                        zipCode: self.shippingZipCode().trim()
                    },
                    billingAddress: {
                        email: self.billingEmail(),
                        addressLine1: self.billingAddressLine1().trim(),
                        addressLine2: self.billingAddressLine2(),
                        city: self.billingCity().trim(),
                        state: self.billingState(),
                        zipCode: self.billingZipCode().trim()
                    },
                    paymentIntentId: paymentIntent.id
                };
                sys.ws.put('/data/orders/createOrder', order, function (res) {
                    self.showForm(false);
                    self.showSuccess(true);
                }, function (errorInfo) {
                    if (errorInfo.code == 'validationErrors') {
                        var errorMessage = 'There are validation errors:<br/>';
                        errorInfo.errors.forEach(function(error) {
                            errorMessage += error.fieldLabel+': '+error.message+'<br/>';
                        });
                        self.generalError(errorMessage);
                    } else {
                        self.generalError('Your card has been charged but there was a problem setting up the purchase. Please, contact support.');
                        console.error('Error placing order');
                        console.error(errorInfo);
                    }
                    self.submitting(false);
                    self.showSubmit(false);
                });
            } else if (paymentIntent.status == 'requires_payment_method') {
                self.paymentError('Payment was not successful. Please, try again or contact support at support@addyourlabs.io');
                self.submitting(false);
            }
        };

        self.init = function() {
            self.email.subscribe(function (newValue) {
                if (newValue) {
                    sys.ws.put('/data/orders/checkCustomerEmail', { email: newValue }, function (res) {
                        if (res.exists) {
                            self.existingUser(true);
                        } else {
                            self.existingUser(false);
                        }
                    }, function (errorInfo) {
                        console.error('Error checking customer email');
                        console.error(errorInfo);
                    });
                }
            });

            // init stripe
            var style = {
                base: {
                    color: '#000',
                    fontSmoothing: 'antialiased',
                    fontSize: '16px',
                    border: '1px solid #ccc',
                    '::placeholder': {
                        color: '#aab7c4'
                    }
                },
                invalid: {
                    color: '#fa755a',
                    iconColor: '#fa755a'
                }
            };            
            self.stripe = Stripe(STRIPE_PUBLIC_KEY);
            // Create an instance of Elements.
            self.elements = self.stripe.elements();
            // Create an instance of the card Element.
            self.card = self.elements.create('card', { style: style });
            // Add an instance of the card Element into the `card-element` <div>.
            self.card.mount('#card-element');
            // Handle real-time validation errors from the card Element.
            self.card.on('change', function (event) {
                var displayError = document.getElementById('card-errors');
                if (event.error) {
                    displayError.textContent = event.error.message;
                } else {
                    displayError.textContent = '';
                }
            });

            // find product ID
            var urlParams = new URLSearchParams(window.location.search);
            var productId = urlParams.get('product');
            self.productId(productId);
            sys.ws.get('/data/products/'+productId, function(res) {
                self.productName(res.name);
                self.productPrice(res.price);
            }, function(errorInfo) {
                console.error('Error fetching product');
                console.error(errorInfo);
            });
        };

        return self;
    };

    model = new Model();
    ko.applyBindings(model);
    model.init();
});