var Ally;
(function (Ally) {
    /**
     * The controller for the page to view group premium plan settings
     */
    var PremiumPlanSettingsController = /** @class */ (function () {
        /**
         * The constructor for the class
         */
        function PremiumPlanSettingsController($http, siteInfo, appCacheService, $timeout, $scope) {
            this.$http = $http;
            this.siteInfo = siteInfo;
            this.appCacheService = appCacheService;
            this.$timeout = $timeout;
            this.$scope = $scope;
            this.settings = new Ally.ChtnSiteSettings();
            this.isLoading = false;
            this.isLoadingUsage = false;
            this.shouldShowPremiumPlanSection = true;
            this.shouldShowPaymentForm = false;
            this.stripeApi = null;
            this.stripeCardElement = null;
            this.isActivatingAnnual = true;
            this.monthlyDisabled = false;
            this.planExpirationColor = "red";
            this.groupEmailChartData = [];
            this.groupEmailAverage = 0;
            this.genInvoiceNumMonths = 1;
            this.genInvoiceShouldIncludeWireInfo = false;
            this.emailUsageChartData = [];
            this.emailUsageChartLabels = [];
            this.emailUsageChartOptions = {};
            this.emailUsageAverageNumMonths = 0;
            this.emailUsageAverageSent = 0;
            this.showInvoiceSection = false;
            this.paymentType = "ach";
            this.shouldShowPremiumPlanSection = AppConfig.appShortName === "condo" || AppConfig.appShortName === "hoa";
            this.homeNamePlural = AppConfig.homeName.toLowerCase() + "s";
            this.showInvoiceSection = siteInfo.userInfo.isAdmin;
            try {
                this.stripeApi = Stripe(StripeApiKey);
            }
            catch (err) {
                console.log(err);
            }
        }
        /**
         * Called on each controller after all the controllers on an element have been constructed
         */
        PremiumPlanSettingsController.prototype.$onInit = function () {
            var _this = this;
            this.monthlyDisabled = this.siteInfo.privateSiteInfo.numUnits <= 10;
            this.refreshData();
            // Get a view token to view the premium plan invoice should one be generated
            if (this.showInvoiceSection) // Add a slight delay to let the rest of the page load
                this.$timeout(function () { return _this.$http.get("/api/DocumentLink/0").then(function (response) { return _this.viewPremiumInvoiceViewId = response.data.vid; }); }, 250);
        };
        /**
         * Occurs when the user clicks the button to cancel the premium plan auto-renewal
         */
        PremiumPlanSettingsController.prototype.cancelPremiumAutoRenew = function () {
            var _this = this;
            if (!confirm("Are you sure?"))
                return;
            this.isLoading = true;
            this.$http.put("/api/Settings/CancelPremium", null).then(function (response) {
                _this.isLoading = false;
                _this.settings.premiumPlanIsAutoRenewed = false;
                _this.shouldShowPaymentForm = false;
                _this.refreshData();
            }, function () {
                _this.isLoading = false;
                alert("Failed to cancel the premium plan. Refresh the page and try again or contact support if the problem persists.");
            });
        };
        PremiumPlanSettingsController.prototype.showStripeError = function (errorMessage) {
            var displayError = document.getElementById('card-errors');
            if (HtmlUtil.isNullOrWhitespace(errorMessage))
                displayError.textContent = null; //'Unknown Error';
            else
                displayError.textContent = errorMessage;
        };
        PremiumPlanSettingsController.prototype.initStripePayment = function () {
            var _this = this;
            var style = {
                base: {
                    color: "#32325d",
                    fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                    fontSmoothing: "antialiased",
                    fontSize: "16px",
                    "::placeholder": {
                        color: "#aab7c4"
                    }
                },
                invalid: {
                    color: "#fa755a",
                    iconColor: "#fa755a"
                }
            };
            var elements = this.stripeApi.elements();
            this.stripeCardElement = elements.create("card", { style: style });
            this.stripeCardElement.mount("#stripe-card-element");
            var onCardChange = function (event) {
                if (event.error)
                    _this.showStripeError(event.error.message);
                else
                    _this.showStripeError(null);
            };
            this.stripeCardElement.on('change', onCardChange);
        };
        PremiumPlanSettingsController.prototype.submitCardToStripe = function () {
            var _this = this;
            this.isLoading = true;
            return this.stripeApi.createPaymentMethod({
                type: 'card',
                card: this.stripeCardElement,
            })
                .then(function (result) {
                if (result.error) {
                    _this.isLoading = false;
                    _this.showStripeError(result.error.message);
                }
                else {
                    var activateInfo = {
                        stripePaymentMethodId: result.paymentMethod.id,
                        shouldPayAnnually: _this.isActivatingAnnual
                    };
                    _this.$http.put("/api/Settings/ActivatePremium", activateInfo).then(function (response) {
                        _this.isLoading = false;
                        _this.settings.premiumPlanIsAutoRenewed = true;
                        _this.shouldShowPaymentForm = false;
                        _this.refreshData();
                    }, function (errorResponse) {
                        _this.isLoading = false;
                        alert("Failed to activate the premium plan. Refresh the page and try again or contact support if the problem persists: " + errorResponse.data.exceptionMessage);
                    });
                    //this.createSubscription( result.paymentMethod.id );
                }
                _this.$scope.$apply();
            });
        };
        /**
         * Occurs when the user clicks the button to generate an annual invoice PDF
         */
        //viewPremiumInvoice()
        //{
        //    this.isLoading = true;
        //    this.$http.get( "/api/Settings/ViewPremiumInvoice" ).then(
        //        ( response: ng.IHttpPromiseCallbackArg<MeteredFeaturesUsage> ) =>
        //        {
        //            this.isLoading = false;
        //            this.settings.premiumPlanIsAutoRenewed = false;
        //            this.shouldShowPaymentForm = false;
        //            this.refreshData();
        //        },
        //        ( errorResponse: ng.IHttpPromiseCallbackArg<Ally.ExceptionResult> ) =>
        //        {
        //            this.isLoading = false;
        //            alert( "Failed to create invoice. Refresh the page and try again or contact support if the problem persists: " + errorResponse.data.exceptionMessage );
        //        }
        //    );
        //}
        /**
         * Occurs when the user clicks the button to generate a Stripe invoice
         */
        PremiumPlanSettingsController.prototype.generateStripeInvoice = function (numMonths, shouldIncludeWireInfo) {
            var _this = this;
            var getUri = "PublicSettings/ViewPremiumInvoice?vid=" + this.viewPremiumInvoiceViewId + "&numMonths=" + numMonths + "&shouldIncludeWireInfo=" + shouldIncludeWireInfo;
            window.open(this.siteInfo.publicSiteInfo.baseApiUrl + getUri, "_blank");
            this.$timeout(function () {
                // Refresh the view token in case the user clicks again
                _this.$http.get("/api/DocumentLink/0").then(function (response) { return _this.viewPremiumInvoiceViewId = response.data.vid; });
            }, 1250);
        };
        /**
         * Occurs when the user clicks the button to enable premium plan auto-renewal
         */
        PremiumPlanSettingsController.prototype.activatePremiumRenewal = function () {
            var _this = this;
            this.shouldShowPaymentForm = true;
            this.updateCheckoutDescription();
            this.$timeout(function () { return _this.initStripePayment(); }, 250);
        };
        PremiumPlanSettingsController.prototype.updateCheckoutDescription = function () {
            var renewedInPast = moment(this.premiumPlanRenewDate).isBefore();
            var payAmount;
            if (this.isActivatingAnnual) {
                payAmount = this.settings.premiumPlanCostDollars * 11;
                this.checkoutDescription = "You will be charged $" + payAmount + " ";
                if (renewedInPast)
                    this.checkoutDescription += " today and you will be charged annually on this date thereafter.";
                else
                    this.checkoutDescription += " on " + moment(this.premiumPlanRenewDate).format("dddd, MMMM Do YYYY") + " and you will be charged annually on that date thereafter.";
            }
            // Otherwise they'll be paying monthly
            else {
                payAmount = this.settings.premiumPlanCostDollars;
                this.checkoutDescription = "You will be charged $" + this.settings.premiumPlanCostDollars + " ";
                if (renewedInPast)
                    this.checkoutDescription += " today and you will be charged monthly on this date thereafter.";
                else
                    this.checkoutDescription += " on " + moment(this.premiumPlanRenewDate).format("dddd, MMMM Do YYYY") + " and you will be charged monthly on that date thereafter.";
            }
            if (renewedInPast)
                this.payButtonText = "Pay $" + payAmount;
            else
                this.payButtonText = "Schedule Payment";
        };
        PremiumPlanSettingsController.prototype.createSubscription = function (paymentMethodId) {
            var _this = this;
            return (fetch('/create-subscription', {
                method: 'post',
                headers: {
                    'Content-type': 'application/json',
                },
                body: JSON.stringify({
                    paymentMethodId: paymentMethodId
                }),
            })
                .then(function (response) {
                return response.json();
            })
                // If the card is declined, display an error to the user.
                .then(function (result) {
                if (result.error) {
                    // The card had an error when trying to attach it to a customer.
                    throw result;
                }
                return result;
            })
                // Normalize the result to contain the object returned by Stripe.
                // Add the addional details we need.
                .then(function (result) {
                return {
                    paymentMethodId: result.paymentMethodId,
                    priceId: result.priceId,
                    subscription: result.subscription,
                };
            })
                // Some payment methods require a customer to be on session
                // to complete the payment process. Check the status of the
                // payment intent to handle these actions.
                //.then( ( result: any ) => this.handlePaymentThatRequiresCustomerAction( result ) )
                // If attaching this card to a Customer object succeeds,
                // but attempts to charge the customer fail, you
                // get a requires_payment_method error.
                //.then( ( result: any ) => this.handleRequiresPaymentMethod( result ) )
                // No more actions required. Provision your service for the user.
                //.then( () =>
                //{
                //    //onSubscriptionComplete
                //    this.isLoading = true;
                //    const paymentInfo = {
                //        paymentId: 1
                //    };
                //} )
                .catch(function (error) {
                // An error has happened. Display the failure to the user here.
                // We utilize the HTML element we created.
                _this.showStripeError(error);
            }));
        };
        PremiumPlanSettingsController.prototype.handlePaymentThatRequiresCustomerAction = function (_a) {
            var _this = this;
            var subscription = _a.subscription, invoice = _a.invoice, priceId = _a.priceId, paymentMethodId = _a.paymentMethodId, isRetry = _a.isRetry;
            if (subscription && subscription.status === 'active') {
                // Subscription is active, no customer actions required.
                return { subscription: subscription, priceId: priceId, paymentMethodId: paymentMethodId };
            }
            // If it's a first payment attempt, the payment intent is on the subscription latest invoice.
            // If it's a retry, the payment intent will be on the invoice itself.
            var paymentIntent = invoice ? invoice.payment_intent : subscription.latest_invoice.payment_intent;
            if (paymentIntent.status === 'requires_action' ||
                (isRetry === true && paymentIntent.status === 'requires_payment_method')) {
                return this.stripeApi
                    .confirmCardPayment(paymentIntent.client_secret, {
                    payment_method: paymentMethodId,
                })
                    .then(function (result) {
                    if (result.error) {
                        // Start code flow to handle updating the payment details.
                        // Display error message in your UI.
                        // The card was declined (i.e. insufficient funds, card has expired, etc).
                        throw result;
                    }
                    else {
                        if (result.paymentIntent.status === 'succeeded') {
                            // Show a success message to your customer.
                            // There's a risk of the customer closing the window before the callback.
                            // We recommend setting up webhook endpoints later in this guide.
                            return {
                                priceId: priceId,
                                subscription: subscription,
                                invoice: invoice,
                                paymentMethodId: paymentMethodId,
                            };
                        }
                    }
                })
                    .catch(function (error) {
                    _this.showStripeError(error);
                });
            }
            else {
                // No customer action needed.
                return { subscription: subscription, priceId: priceId, paymentMethodId: paymentMethodId };
            }
        };
        PremiumPlanSettingsController.prototype.handleRequiresPaymentMethod = function (_a) {
            var subscription = _a.subscription, paymentMethodId = _a.paymentMethodId, priceId = _a.priceId;
            if (subscription.status === 'active') {
                // subscription is active, no customer actions required.
                return { subscription: subscription, priceId: priceId, paymentMethodId: paymentMethodId };
            }
            else if (subscription.latest_invoice.payment_intent.status === 'requires_payment_method') {
                // Using localStorage to manage the state of the retry here,
                // feel free to replace with what you prefer.
                // Store the latest invoice ID and status.
                localStorage.setItem('latestInvoiceId', subscription.latest_invoice.id);
                localStorage.setItem('latestInvoicePaymentIntentStatus', subscription.latest_invoice.payment_intent.status);
                throw { error: { message: 'Your card was declined.' } };
            }
            else {
                return { subscription: subscription, priceId: priceId, paymentMethodId: paymentMethodId };
            }
        };
        /**
         * Retrieve the email usage from the server
         */
        PremiumPlanSettingsController.prototype.refreshMeteredUsage = function () {
            var _this = this;
            this.isLoadingUsage = true;
            this.$http.get("/api/Settings/MeteredFeaturesUsage").then(function (response) {
                _this.isLoadingUsage = false;
                _this.meteredUsage = response.data;
                _this.meteredUsage.months = _.sortBy(_this.meteredUsage.months, function (m) { return m.year.toString() + "_" + (m.month > 9 ? "" : "0") + m.month; });
                _this.emailUsageChartLabels = [];
                var emailsSentChartData = [];
                var groupEmailChartData = [];
                var totalEmailsSent = 0;
                var totalGroupEmailProcessed = 0;
                for (var i = 0; i < response.data.months.length; ++i) {
                    var curMonth = response.data.months[i];
                    var monthName = moment([curMonth.year, curMonth.month - 1, 1]).format("MMMM");
                    // Add the year to the first and last entries
                    if (i === 0 || i === _this.meteredUsage.months.length - 1)
                        _this.emailUsageChartLabels.push(monthName + " " + curMonth.year);
                    else
                        _this.emailUsageChartLabels.push(monthName);
                    emailsSentChartData.push(curMonth.numEmailsSent);
                    groupEmailChartData.push(curMonth.numGroupEmailsProcessed);
                    totalEmailsSent += curMonth.numEmailsSent;
                    totalGroupEmailProcessed += curMonth.numGroupEmailsProcessed;
                }
                _this.emailUsageChartData = [emailsSentChartData];
                _this.groupEmailChartData = [groupEmailChartData];
                _this.emailUsageAverageNumMonths = response.data.months.length;
                if (_this.emailUsageAverageNumMonths > 1) {
                    _this.emailUsageAverageSent = Math.round(totalEmailsSent / _this.emailUsageAverageNumMonths);
                    _this.groupEmailAverage = Math.round(totalGroupEmailProcessed / _this.emailUsageAverageNumMonths);
                }
            });
            this.emailUsageChartOptions = {
                scales: {
                    yAxes: [
                        {
                            id: 'y-axis-1',
                            type: 'linear',
                            display: true,
                            position: 'left',
                            ticks: {
                                suggestedMin: 0,
                                // OR //
                                beginAtZero: true // minimum value will be 0.
                            }
                        }
                    ]
                }
            };
        };
        /**
         * Populate the page from the server
         */
        PremiumPlanSettingsController.prototype.refreshData = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.get("/api/Settings").then(function (response) {
                _this.isLoading = false;
                _this.settings = response.data;
                _this.isPremiumPlanActive = _this.siteInfo.privateSiteInfo.isPremiumPlanActive;
                _this.premiumPlanRenewDate = new Date();
                _this.premiumPlanRenewDate = moment(_this.settings.premiumPlanExpirationDate).add(1, "days").toDate();
                if (_this.settings.premiumPlanIsAutoRenewed) {
                    _this.planExpirationColor = "green";
                    _this.$http.get("/api/Settings/StripeBillingPortal").then(function (response) { return _this.stripePortalUrl = response.data.portalUrl; });
                }
                else {
                    var twoMonthsBefore = moment(_this.settings.premiumPlanExpirationDate).add(-2, "months");
                    if (moment().isBefore(twoMonthsBefore))
                        _this.planExpirationColor = "green";
                    else
                        _this.planExpirationColor = "red";
                }
                _this.refreshMeteredUsage();
            });
        };
        /**
         * Bring the user to view their email history
         */
        PremiumPlanSettingsController.prototype.goToEmailHistory = function () {
            this.appCacheService.set("goToEmailHistory", "true");
            window.location.hash = "#!/ManageResidents";
            return true;
        };
        /**
         * Start the Stripe-Plaid ACH-linking flow
         */
        PremiumPlanSettingsController.prototype.startPlaidAchConnection = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.get("/api/Plaid/StripeLinkToken").then(function (httpResponse) {
                _this.isLoading = false;
                if (!httpResponse.data) {
                    alert("Failed to start Plaid connection. Please contact support.");
                    return;
                }
                var plaidConfig = {
                    token: httpResponse.data,
                    onSuccess: function (public_token, metadata) {
                        console.log("Plaid StripeLinkToken onSuccess", metadata);
                        _this.completePlaidAchConnection(public_token, metadata.account_id);
                    },
                    onLoad: function () { },
                    onExit: function (err, metadata) { console.log("update onExit.err", err, metadata); },
                    onEvent: function (eventName, metadata) { console.log("update onEvent.eventName", eventName, metadata); },
                    receivedRedirectUri: null,
                };
                var plaidHandler = Plaid.create(plaidConfig);
                plaidHandler.open();
            }, function (httpResponse) {
                _this.isLoading = false;
                alert("Failed to start Plaid connection: " + httpResponse.data.exceptionMessage);
            });
        };
        /**
         * Complete the Stripe-Plaid ACH-linking flow
         */
        PremiumPlanSettingsController.prototype.completePlaidAchConnection = function (accessToken, accountId) {
            var _this = this;
            this.isLoading = true;
            var postData = {
                accessToken: accessToken,
                selectedAccountIds: [accountId]
            };
            this.$http.post("/api/Plaid/ProcessStripeAccessToken", postData).then(function (httpResponse) {
                _this.isLoading = false;
                _this.checkoutDescription = "Account successfully linked, reloading...";
                window.location.reload();
            }, function (httpResponse) {
                _this.isLoading = false;
                alert("Failed to link account: " + httpResponse.data.exceptionMessage);
            });
        };
        /**
         * Complete the Stripe-Plaid ACH-linking flow
         */
        PremiumPlanSettingsController.prototype.makeAchStripePayment = function () {
            var _this = this;
            this.isLoading = true;
            var activateInfo = {
                shouldPayAnnually: this.isActivatingAnnual,
                payViaAch: true
            };
            this.$http.put("/api/Settings/ActivatePremium", activateInfo).then(function (response) {
                _this.isLoading = false;
                _this.settings.premiumPlanIsAutoRenewed = true;
                _this.shouldShowPaymentForm = false;
                _this.refreshData();
            }, function (errorResponse) {
                _this.isLoading = false;
                alert("Failed to activate the premium plan. Refresh the page and try again or contact support if the problem persists: " + errorResponse.data.exceptionMessage);
            });
        };
        PremiumPlanSettingsController.prototype.onPaymentTypeChange = function () {
            var _this = this;
            // Tell Stripe to populate the card info area
            if (this.paymentType === "creditCard")
                this.$timeout(function () { return _this.initStripePayment(); }, 250);
        };
        PremiumPlanSettingsController.$inject = ["$http", "SiteInfo", "appCacheService", "$timeout", "$scope"];
        return PremiumPlanSettingsController;
    }());
    Ally.PremiumPlanSettingsController = PremiumPlanSettingsController;
    var GroupMonthEmails = /** @class */ (function () {
        function GroupMonthEmails() {
        }
        return GroupMonthEmails;
    }());
    Ally.GroupMonthEmails = GroupMonthEmails;
})(Ally || (Ally = {}));
CA.angularApp.component("premiumPlanSettings", {
    templateUrl: "/ngApp/chtn/manager/settings/premium-plan-settings.html",
    controller: Ally.PremiumPlanSettingsController
});
var StripePayNeedsCustomer = /** @class */ (function () {
    function StripePayNeedsCustomer() {
    }
    return StripePayNeedsCustomer;
}());
var MeteredFeaturesUsage = /** @class */ (function () {
    function MeteredFeaturesUsage() {
    }
    return MeteredFeaturesUsage;
}());
