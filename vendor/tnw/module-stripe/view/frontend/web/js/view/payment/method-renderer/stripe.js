define([
    "jquery",
    "mage/translate",
    "Magento_Payment/js/view/payment/cc-form",
    "Magento_Checkout/js/model/full-screen-loader",
    "Magento_Checkout/js/action/set-payment-information",
    "TNW_Stripe/js/view/payment/adapter",
    "TNW_Stripe/js/validator",
    "TNW_Stripe/js/featherlight",
    "Magento_Vault/js/view/payment/vault-enabler",
    "Magento_Checkout/js/model/quote",
    "Magento_Checkout/js/model/payment/additional-validators",
    "Magento_Checkout/js/action/redirect-on-success",
    "stripejs",
], function (
    $,
    $t,
    Component,
    fullScreenLoader,
    setPaymentInformationAction,
    adapter,
    validator,
    featherlight,
    VaultEnabler,
    quote,
    additionalValidators,
    redirectOnSuccessAction
) {
    "use strict"

    return Component.extend({
        defaults: {
            active: false,
            template: "TNW_Stripe/payment/form",
            paymentMethodToken: null,
            isValidCardNumber: false,

            /**
             * Additional payment data
             *
             * {Object}
             */
            additionalData: {},

            /**
             * Stripe client configuration
             *
             * {Object}
             */
            clientConfig: {},
            imports: {
                onActiveChange: "active",
            },
        },

        /**
         * @returns {exports}
         */
        initialize: function () {
            this._super()
            this.vaultEnabler = new VaultEnabler()
            this.vaultEnabler.setPaymentCode(this.getVaultCode())

            return this
        },

        /**
         * Init config
         */
        initClientConfig: function () {
            this._super()

            // Hosted fields settings
            this.clientConfig.hostedFields = this.getHostedFields()
        },

        /**
         * Set list of observable attributes
         *
         * @returns {exports}
         */
        initObservable: function () {
            validator.setConfig(window.checkoutConfig.payment[this.getCode()])
            this._super().observe(["active"])

            this.initClientConfig()
            return this
        },

        initStripe: function () {
            var self = this

            var intervalId = setInterval(function () {
                // stop loader when frame will be loaded
                if ($("#tnw_stripe_cc_number").length) {
                    clearInterval(intervalId)

                    adapter.setConfig(self.clientConfig)
                    adapter.setup()
                }
            }, 500)
        },

        /**
         * Get Stripe Hosted Fields
         * @returns {Object}
         */
        getHostedFields: function () {
            var self = this,
                fields = {
                    number: {
                        selector: self.getSelector("cc_number"),
                    },
                    expiry: {
                        selector: self.getSelector("expiration"),
                    },
                    cvc: {
                        selector: self.getSelector("cc_cid"),
                    },
                }

            /**
             * Triggers on Hosted Field changes
             * @param {Object} event
             */
            fields.onFieldEvent = function (event) {
                self.paymentMethodToken = null
                self.isValidCardNumber = event.complete
                self.selectedCardType(validator.getMageCardType(event.brand, self.getCcAvailableTypes()))
            }
            fields.onExpiryEvent = function () {
                self.paymentMethodToken = null
            }
            fields.onCVCEvent = function () {
                self.paymentMethodToken = null
            }

            return fields
        },

        getCode: function () {
            return "tnw_stripe"
        },

        /**
         * Check if payment is active
         *
         * @returns {Boolean}
         */
        isActive: function () {
            var active = this.getCode() === this.isChecked()

            this.active(active)

            return active
        },

        /**
         * Triggers when payment method change
         * @param {Boolean} isActive
         */
        onActiveChange: function (isActive) {
            if (!isActive) {
                return
            }
            this.initStripe()
        },

        getData: function () {
            var data = {
                method: this.getCode(),
                additional_data: {
                    cc_token: this.paymentMethodToken,
                },
            }

            data["additional_data"] = _.extend(data["additional_data"], this.additionalData)
            this.vaultEnabler.visitAdditionalData(data)

            return data
        },

        getPublishableKey: function () {
            return window.checkoutConfig.payment[this.getCode()].publishableKey
        },

        validate: function () {
            var $form = $("#" + this.getCode() + "-form")
            return $form.validation() && $form.validation("isValid")
        },

        isVaultEnabled: function () {
            return this.vaultEnabler.isVaultEnabled()
        },

        getVaultCode: function () {
            return window.checkoutConfig.payment[this.getCode()].vaultCode
        },

        /**
         * Address
         * @return {{name: string, address_country: string, address_line1: *}}
         */
        getOwnerData: function () {
            var billingAddress = quote.billingAddress(),
                email = quote.guestEmail,
                stripeData = {
                    name: billingAddress.firstname + " " + billingAddress.lastname,
                    email: email,
                    address: {
                        country: billingAddress.countryId,
                        line1: billingAddress.street[0],
                        city: billingAddress.city,
                    },
                }

            if (billingAddress.street.length === 2) {
                stripeData.address.line2 = billingAddress.street[1]
            }

            if (billingAddress.hasOwnProperty("postcode")) {
                stripeData.address.postal_code = billingAddress.postcode
            }

            if (billingAddress.hasOwnProperty("regionCode")) {
                stripeData.address.state = billingAddress.regionCode
            }

            return stripeData
        },

        /**
         * Address
         * @return {{name: string, address_country: string, address_line1: *}}
         */
        getShippingData: function () {
            var shippingAddress = quote.shippingAddress(),
                virtual = quote.isVirtual(),
                stripeData = null

            if (!virtual) {
                stripeData = {
                    name: shippingAddress.firstname + " " + shippingAddress.lastname,
                    address: {
                        country: shippingAddress.countryId,
                        line1: shippingAddress.street[0],
                    },
                }

                if (shippingAddress.street.length === 2) {
                    stripeData.address.line2 = shippingAddress.street[1]
                }

                if (shippingAddress.hasOwnProperty("postcode")) {
                    stripeData.address.postal_code = shippingAddress.postcode
                }

                if (shippingAddress.hasOwnProperty("regionCode")) {
                    stripeData.address.state = shippingAddress.regionCode
                }
            }

            return stripeData
        },

        /**
         * Get full selector name
         *
         * @param {String} field
         * @returns {String}
         */
        getSelector: function (field) {
            return "#" + this.getCode() + "_" + field
        },

        /**
         * Validate current credit card type
         * @returns {Boolean}
         */
        validateCardType: function () {
            var $selector = $(this.getSelector("cc_number")),
                invalidClass = "stripe-hosted-fields-invalid"

            $selector.removeClass(invalidClass)

            if (this.selectedCardType() === null || !this.isValidCardNumber) {
                $(this.getSelector("cc_number")).addClass(invalidClass)
                return false
            }

            return true
        },

        /**
         * Get list of available CC types
         *
         * @returns {Object}
         */
        getCcAvailableTypes: function () {
            var availableTypes = validator.getAvailableCardTypes(),
                billingAddress = quote.billingAddress(),
                billingCountryId

            this.lastBillingAddress = quote.shippingAddress()

            if (!billingAddress) {
                billingAddress = this.lastBillingAddress
            }

            billingCountryId = billingAddress.countryId
            if (billingCountryId && validator.getCountrySpecificCardTypes(billingCountryId)) {
                return validator.collectTypes(availableTypes, validator.getCountrySpecificCardTypes(billingCountryId))
            }

            return availableTypes
        },

        /**
         * Check if the expiration date field is filled
         * @returns {Boolean}
         */
        validateExpirationDate: function () {
            let $selector = $(this.getSelector("expiration")),
                invalidClass = "stripe-hosted-fields-invalid"

            $selector.removeClass(invalidClass)
            if ($selector.hasClass("StripeElement--invalid") || $selector.hasClass("StripeElement--empty")) {
                $(this.getSelector("expiration")).addClass(invalidClass)
                return false
            }
            return true
        },

        /**
         * Check if the cvv field is filled
         * @returns {Boolean}
         */
        validateCvv: function () {
            let $selector = $(this.getSelector("cc_cid")),
                invalidClass = "stripe-hosted-fields-invalid"

            $selector.removeClass(invalidClass)

            if ($selector.hasClass("StripeElement--invalid") || $selector.hasClass("StripeElement--empty")) {
                $(this.getSelector("cc_cid")).addClass(invalidClass)
                return false
            }
            return true
        },

        /**
         * Set payment token
         * @param {String} paymentMethodToken
         */
        setPaymentMethodToken: function (paymentMethodToken) {
            this.paymentMethodToken = paymentMethodToken
        },

        /**
         * Returns state of place order button
         * @returns {Boolean}
         */
        isButtonActive: function () {
            return this.isActive() && this.isPlaceOrderActionAllowed()
        },

        /**
         * Triggers order placing
         */
        placeOrderClick: function () {
            var self = this,
                validationStatus = {
                    cartType: this.validateCardType(),
                    cvv: this.validateCvv(),
                    expirationDate: this.validateExpirationDate(),
                }

            if (
                !this.validate() ||
                !additionalValidators.validate() ||
                !validationStatus.cartType ||
                !validationStatus.cvv ||
                !validationStatus.expirationDate ||
                this.isPlaceOrderActionAllowed() === false ||
                window.isGettingPi
            ) {
                return
            }

            fullScreenLoader.startLoader()
            this.isPlaceOrderActionAllowed(false)

            if (this.paymentMethodToken) {
                self.placeOrder()
                return
            }

            adapter
                .createPaymentMethodByCart({
                    billing_details: self.getOwnerData(),
                })
                .done(function (response) {
                    var card = response.paymentMethod.card,
                        currencyCode = quote.totals()["base_currency_code"]
                    self.additionalData = _.extend(self.additionalData, {
                        cc_exp_month: card.exp_month,
                        cc_exp_year: card.exp_year,
                        cc_last4: card.last4,
                        cc_type: card.brand,
                    })

                    adapter
                        .createPaymentIntent({
                            paymentMethod: response.paymentMethod,
                            amount: quote.totals()["base_grand_total"],
                            currency: currencyCode,
                            shipping: self.getShippingData(),
                        })
                        .done(function (response) {
                            if (response.skip_3ds) {
                                self.setPaymentMethodToken(response.paymentIntent.id)
                                self.placeOrder()
                                return
                            }
                            // Disable Payment Token
                            self.vaultEnabler.isActivePaymentTokenEnabler(false)
                            if (!response.pi) {
                                fullScreenLoader.stopLoader(true)
                                return
                            }
                            adapter.authenticateCustomer(response.pi, function (error, response) {
                                if (error) {
                                    self.isPlaceOrderActionAllowed(true)
                                    self.messageContainer.addErrorMessage({
                                        message: $t("3D Secure authentication failed."),
                                    })
                                } else {
                                    self.vaultEnabler.isActivePaymentTokenEnabler(true)
                                    self.setPaymentMethodToken(response.paymentIntent.id)
                                    self.additionalData = _.extend(self.additionalData, {
                                        cc_3ds: true,
                                    })
                                    self.placeOrder()
                                }
                            })
                        })
                        .fail(function (res) {
                            self.messageContainer.addErrorMessage({
                                message: self.resolveErrorText(res),
                            })
                            fullScreenLoader.stopLoader(true)
                            self.isPlaceOrderActionAllowed(true)
                        })
                })
                .fail(function (res) {
                    self.messageContainer.addErrorMessage({
                        message: self.resolveErrorText(res),
                    })
                    fullScreenLoader.stopLoader(true)
                    self.isPlaceOrderActionAllowed(true)
                })
        },

        /**
         * Place order.
         */
        placeOrder: function (data, event) {
            var self = this

            if (event) {
                event.preventDefault()
            }
            this.getPlaceOrderDeferredObject()
                .done(function () {
                    self.afterPlaceOrder()

                    if (self.redirectAfterPlaceOrder) {
                        redirectOnSuccessAction.execute()
                    }
                })
                .fail(function (res) {
                    self.messageContainer.addErrorMessage({
                        message: self.resolveErrorText(res),
                    })
                    self.isPlaceOrderActionAllowed(true)
                })
                .always(function () {
                    fullScreenLoader.stopLoader(true)
                })
        },

        /**
         * Resolve error text from various types of responses
         * @param res
         * @return {*}
         */
        resolveErrorText: function (res) {
            if (res.error && res.error.message) {
                return res.error.message
            }
            if (res.responseJSON && res.responseJSON.message) {
                return res.responseJSON.message
            }
            return $t("An error occurred on the server.")
        },

        getReturnUrl: function () {
            return window.checkoutConfig.payment[this.getCode()].returnUrl
        },

        getImgLoadingUrl: function () {
            return window.checkoutConfig.payment[this.getCode()].imgLoading
        },
    })
})
