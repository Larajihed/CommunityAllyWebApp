var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var Ally;
(function (Ally) {
    var SimpleUserEntry = /** @class */ (function () {
        function SimpleUserEntry() {
        }
        return SimpleUserEntry;
    }());
    Ally.SimpleUserEntry = SimpleUserEntry;
    var SimpleUserEntryWithTerms = /** @class */ (function (_super) {
        __extends(SimpleUserEntryWithTerms, _super);
        function SimpleUserEntryWithTerms() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return SimpleUserEntryWithTerms;
    }(SimpleUserEntry));
    Ally.SimpleUserEntryWithTerms = SimpleUserEntryWithTerms;
    var ProfileUserInfo = /** @class */ (function (_super) {
        __extends(ProfileUserInfo, _super);
        function ProfileUserInfo() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return ProfileUserInfo;
    }(SimpleUserEntryWithTerms));
    var PtaMember = /** @class */ (function (_super) {
        __extends(PtaMember, _super);
        function PtaMember() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return PtaMember;
    }(SimpleUserEntry));
    Ally.PtaMember = PtaMember;
    /**
     * The controller for the profile page
     */
    var MyProfileController = /** @class */ (function () {
        /**
         * The constructor for the class
         */
        function MyProfileController($rootScope, $http, $location, appCacheService, siteInfo, $scope) {
            this.$rootScope = $rootScope;
            this.$http = $http;
            this.$location = $location;
            this.appCacheService = appCacheService;
            this.siteInfo = siteInfo;
            this.$scope = $scope;
            this.showPassword = false;
            this.shouldShowPassword = false;
            this.selectedProfileView = "Primary";
            this.passwordComplexity = "short";
        }
        /**
        * Called on each controller after all the controllers on an element have been constructed
        */
        MyProfileController.prototype.$onInit = function () {
            var _this = this;
            this.isDemoSite = HtmlUtil.getSubdomain() === "demosite";
            if (this.siteInfo.privateSiteInfo)
                this.canHideContactInfo = this.siteInfo.privateSiteInfo.canHideContactInfo;
            this.retrieveProfileData();
            var hookUpPhotoFileUpload = function () {
                var uploader = $('#JQFileUploader');
                uploader.fileupload({
                    dropZone: null,
                    pasteZone: null,
                    add: function (e, data) {
                        data.url = "api/DocumentUpload/ProfileImage?ApiAuthToken=" + _this.siteInfo.authToken;
                        if (_this.siteInfo.publicSiteInfo.baseApiUrl)
                            data.url = _this.siteInfo.publicSiteInfo.baseApiUrl + "DocumentUpload/ProfileImage";
                        _this.$scope.$apply(function () { return _this.isLoading = true; });
                        var xhr = data.submit();
                        xhr.done(function (result) {
                            _this.$scope.$apply(function () {
                                // Reload the page to see the changes
                                window.location.reload();
                            });
                        });
                    },
                    beforeSend: function (xhr) {
                        if (_this.siteInfo.publicSiteInfo.baseApiUrl)
                            xhr.setRequestHeader("Authorization", "Bearer " + _this.$rootScope.authToken);
                        else
                            xhr.setRequestHeader("ApiAuthToken", _this.$rootScope.authToken);
                    },
                    fail: function (e, data) {
                        _this.$scope.$apply(function () {
                            _this.isLoading = false;
                            alert("Upload Failed: " + data.jqXHR.responseJSON.exceptionMessage);
                        });
                    }
                });
            };
            setTimeout(hookUpPhotoFileUpload, 500);
        };
        /**
         * Save the user's profile photo setting
         */
        MyProfileController.prototype.saveProfilePhoto = function (type) {
            var _this = this;
            if (this.initialProfileImageType === "upload") {
                if (!confirm("Are you sure you want to change your profile image away from your uploaded photo? Your uploaded photo will be deleted.")) {
                    this.profileImageType = this.initialProfileImageType;
                    return;
                }
            }
            this.isLoading = true;
            this.$http.put("/api/MyProfile/ProfileImage?type=" + type, null).then(function () {
                _this.isLoading = false;
                _this.initialProfileImageType = _this.profileImageType;
            }, function (httpResponse) {
                _this.isLoading = false;
                alert("Failed to save: " + httpResponse.data.exceptionMessage);
            });
        };
        /**
         * Occurs when the user checks to box to see what they're typing
         */
        MyProfileController.prototype.onShowPassword = function () {
            var passwordTextBox = document.getElementById("passwordTextBox");
            passwordTextBox.type = this.shouldShowPassword ? "text" : "password";
        };
        /**
         * Populate the page
         */
        MyProfileController.prototype.retrieveProfileData = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.get("/api/MyProfile").then(function (httpResponse) {
                _this.isLoading = false;
                _this.profileInfo = httpResponse.data;
                _this.initialProfileImageType = "blank";
                if (!_this.profileInfo.avatarUrl || _this.profileInfo.avatarUrl.indexOf("blank-headshot") !== -1)
                    _this.initialProfileImageType = "blank";
                else if (_this.profileInfo.avatarUrl && _this.profileInfo.avatarUrl.indexOf("gravatar") !== -1)
                    _this.initialProfileImageType = "gravatar";
                else if (_this.profileInfo.avatarUrl && _this.profileInfo.avatarUrl.length > 0)
                    _this.initialProfileImageType = "upload";
                if (_this.initialProfileImageType !== "upload")
                    _this.profileInfo.avatarUrl = null;
                _this.profileImageType = _this.initialProfileImageType;
                _this.gravatarUrl = "https://www.gravatar.com/avatar/" + md5((_this.profileInfo.email || "").toLowerCase()) + "?s=80&d=identicon";
                // Don't show empty email address
                if (HtmlUtil.endsWith(_this.profileInfo.email, "@condoally.com"))
                    _this.profileInfo.email = "";
                _this.needsToAcceptTerms = _this.profileInfo.acceptedTermsDate === null && !_this.isDemoSite;
                _this.hasAcceptedTerms = !_this.needsToAcceptTerms; // Gets set by the checkbox
                _this.$rootScope.shouldHideMenu = _this.needsToAcceptTerms;
                // Was used before, here for convenience
                _this.saveButtonStyle = {
                    width: "100px",
                    "font-size": "1em"
                };
            });
        };
        /**
         * Occurs when the user hits the save button
         */
        MyProfileController.prototype.onSaveInfo = function () {
            var _this = this;
            this.isLoading = true;
            this.$http.put("/api/MyProfile", this.profileInfo).then(function () {
                _this.profileInfo.password = null;
                _this.resultMessage = "Your changes have been saved.";
                // $rootScope.hideMenu is true when this is the user's first login
                if (_this.$rootScope.shouldHideMenu) {
                    _this.$rootScope.shouldHideMenu = false;
                    _this.$location.path("/Home");
                }
                _this.isLoading = false;
            }, function (httpResponse) {
                _this.isLoading = false;
                alert("Failed to save: " + httpResponse.data.exceptionMessage);
            });
        };
        /**
         * Occurs when the user modifies the password field
         */
        MyProfileController.prototype.onPasswordChange = function () {
            if (!this.profileInfo.password || this.profileInfo.password.length < 6) {
                this.passwordComplexity = "short";
                return;
            }
            var hasLetter = !!this.profileInfo.password.match(/[a-z]+/i);
            var hasNumber = !!this.profileInfo.password.match(/[0-9]+/);
            var hasSymbol = !!this.profileInfo.password.match(/[^a-z0-9]+/i);
            var isComplex = this.profileInfo.password.length >= 12
                && hasLetter
                && hasNumber
                && hasSymbol;
            this.passwordComplexity = isComplex ? "complex" : "simple";
        };
        MyProfileController.$inject = ["$rootScope", "$http", "$location", "appCacheService", "SiteInfo", "$scope"];
        return MyProfileController;
    }());
    Ally.MyProfileController = MyProfileController;
})(Ally || (Ally = {}));
CA.angularApp.component("myProfile", {
    templateUrl: "/ngApp/chtn/member/my-profile.html",
    controller: Ally.MyProfileController
});
