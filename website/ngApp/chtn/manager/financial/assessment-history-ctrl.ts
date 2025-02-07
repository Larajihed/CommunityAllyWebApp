﻿namespace Ally
{
    enum PeriodicPaymentFrequency
    {
        Monthly = 50, // Start at number that gives room both before and after
        Quarterly,
        Semiannually,
        Annually
    }


    class PeriodicPayment
    {
        paymentId: number;
        year: number;
        /** The 1-based period index (i.e. 1 = January) */
        period: number;
        isPaid: boolean;
        amount: number;
        paymentDate: Date;
        payerUserId: string;
        wePayCheckoutId: number;
        checkNumber: string;
        notes: string;
        payerNotes: string;
        wePayStatus: string;
        groupId: number;
        paymentsInfoId: number;

        /// Indicates if this payment is simply a placeholder entry, i.e. doesn't have a backing entry in the DB
        isEmptyEntry: boolean = false;
    }


    export class AssessmentPayment extends PeriodicPayment
    {
        unitId: number;
    }


    class PayerInfo
    {
        userId: string;
        name: string;

        // Not from the server
        enteredPayments: PeriodicPayment[];
        displayPayments: PeriodicPayment[];
    }


    class FullPaymentHistory
    {
        units: UnitWithOwner[];
        payments: PeriodicPayment[];
        specialAssessments: any[];
        payers: PayerInfo[];
    }


    /**
     * The controller for the page to view resident assessment payment history
     */
    export class AssessmentHistoryController implements ng.IController
    {
        static $inject = ["$http", "$location", "SiteInfo", "appCacheService"];

        LocalStorageKey_ShowPaymentInfo = "AssessmentHistory_ShowPaymentInfo";
        LocalStorageKey_ShouldColorCodePayments = "AssessmentHistory_ColorCodePayment";
        LocalStorageKey_ShowBalanceCol = "AssessmentHistory_ShowBalanceCol";

        static readonly PeriodicPaymentFrequency_Monthly = 50;
        static readonly PeriodicPaymentFrequency_Quarterly = 51;
        static readonly PeriodicPaymentFrequency_Semiannually = 52;
        static readonly PeriodicPaymentFrequency_Annually = 53;


        // The number of pay periods that are visible on the grid
        NumPeriodsVisible = 10;

        pageTitle: string;
        authToken: string;
        showPaymentInfo: boolean;
        shouldShowBalanceCol = false;
        assessmentFrequency: PeriodicPaymentFrequency;
        payPeriodName: string;
        maxPeriodRange: number;
        periodNames: string[];
        shortPeriodNames: string[];
        startPeriodValue: number;
        startYearValue: number;
        isPeriodicPaymentTrackingEnabled: boolean;
        isLoading: boolean;
        shouldShowCreateSpecialAssessment: boolean = false;
        createSpecialAssessment: any;
        visiblePeriodNames: PeriodEntry[];
        unitPayments: Map<number, UnitWithPayment>;
        nameSortedUnitPayments: UnitWithPayment[];
        payers: PayerInfo[];
        editPayment: any;
        showRowType: "unit" | "member" = "unit";
        isForMemberGroup: boolean = false;
        isSavingPayment: boolean = false;
        shouldColorCodePayments: boolean = false;
        shouldShowFillInSection: boolean = false;
        selectedFillInPeriod: PeriodEntry = null;
        baseApiUri: string;
        viewExportViewId: string;
        shouldShowNeedsAssessmentSetup: boolean = false;
        hasAssessments: boolean | null = null;
        todaysPayPeriod: { periodValue: number, yearValue: number };



        /**
        * The constructor for the class
        */
        constructor( private $http: ng.IHttpService, private $location: ng.ILocationService, private siteInfo: Ally.SiteInfoService, private appCacheService: AppCacheService )
        {
        }


        /**
        * Called on each controller after all the controllers on an element have been constructed
        */
        $onInit(): void
        {
            this.baseApiUri = this.siteInfo.publicSiteInfo.baseApiUrl;
            this.isForMemberGroup = AppConfig.appShortName === "neighborhood" || AppConfig.appShortName === "block-club" || AppConfig.appShortName === "pta";

            if( this.isForMemberGroup )
                this.pageTitle = "Membership Dues Payment History";
            else
                this.pageTitle = "Assessment Payment History";

            if( this.isForMemberGroup )
                this.NumPeriodsVisible = 8;

            this.authToken = window.localStorage.getItem( "ApiAuthToken" );

            if( this.isForMemberGroup )
                this.showRowType = "member";
            else if( AppConfig.isChtnSite )
                this.showRowType = "unit";
            else
                console.log( "Unhandled app type for payment history: " + AppConfig.appShortName );

            // Example
            //var payment =
            //{
            //    paymentId: 0,
            //    year: 2014,
            //    period: 1, // 1 = January
            //    isPaid: false,
            //    amount: 1.23,
            //    paymentDate: "1/2/14",
            //    checkNumber: "123",
            //    unitId: 1
            //};

            this.showPaymentInfo = window.localStorage[this.LocalStorageKey_ShowPaymentInfo] === "true";
            this.shouldColorCodePayments = window.localStorage[this.LocalStorageKey_ShouldColorCodePayments] === "true";
            this.shouldShowBalanceCol = window.localStorage[this.LocalStorageKey_ShowBalanceCol] === "true";

            if( !this.siteInfo.privateSiteInfo.assessmentFrequency )
            {
                this.hasAssessments = this.siteInfo.privateSiteInfo.hasAssessments;
                this.shouldShowNeedsAssessmentSetup = true;
                return;
            }
            
            this.assessmentFrequency = <PeriodicPaymentFrequency>this.siteInfo.privateSiteInfo.assessmentFrequency;
            if( this.isForMemberGroup )
                this.assessmentFrequency = AssessmentHistoryController.PeriodicPaymentFrequency_Annually;

            // Set the period name
            this.payPeriodName = "month";
            if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Quarterly )
                this.payPeriodName = "quarter";
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Semiannually )
                this.payPeriodName = "half-year";
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Annually )
                this.payPeriodName = "year";


            // Set the range values
            this.maxPeriodRange = 12;
            if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Quarterly )
                this.maxPeriodRange = 4;
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Semiannually )
                this.maxPeriodRange = 2;
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Annually )
                this.maxPeriodRange = 1;

            this.todaysPayPeriod = this.getTodaysPayPeriod();

            // Set the label values
            //const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            //const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            //const quarterNames = ["Quarter 1", "Quarter 2", "Quarter 3", "Quarter 4"];
            //const shortQuarterNames = ["Q1", "Q2", "Q3", "Q4"];
            //const semiannualNames = ["First Half", "Second Half"];
            //const shortSemiannualNames = ["1st Half", "2nd Half"];

            const payFrequencyInfo = FrequencyIdToInfo( this.assessmentFrequency );
            this.periodNames = GetLongPayPeriodNames( payFrequencyInfo.intervalName );
            this.shortPeriodNames = GetShortPayPeriodNames( payFrequencyInfo.intervalName );
            if( !this.periodNames )
            {
                this.periodNames = [""];
                this.shortPeriodNames = [""];
            }
            //if( this.assessmentFrequency === PeriodicPaymentFrequency_Quarterly )
            //{
            //    this.periodNames = quarterNames;
            //    this.shortPeriodNames = shortQuarterNames;
            //}
            //else if( this.assessmentFrequency === PeriodicPaymentFrequency_Semiannually )
            //{
            //    this.periodNames = semiannualNames;
            //    this.shortPeriodNames = shortSemiannualNames;
            //}
            //else if( this.assessmentFrequency === PeriodicPaymentFrequency_Annually )
            //{
            //    this.periodNames = [""];
            //    this.shortPeriodNames = [""];
            //}

            // Set the current period. We add 2 to the period so we have a buffer ahead of today's
            // date so we can show some future payments.
            this.startPeriodValue = new Date().getMonth() + 2;
            this.startYearValue = new Date().getFullYear();
            if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Quarterly )
            {
                this.startPeriodValue = Math.floor( new Date().getMonth() / 4 ) + 2;
            }
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Semiannually )
            {
                this.startPeriodValue = Math.floor( new Date().getMonth() / 6 ) + 2;
            }
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Annually )
            {
                this.startPeriodValue = 1;
                this.startYearValue = new Date().getFullYear() + 1;
            }

            // If we're past the year's number of pay periods, go to the next year
            if( this.startPeriodValue > this.maxPeriodRange )
            {
                this.startPeriodValue = 1;
                this.startYearValue += 1;
            }

            this.isPeriodicPaymentTrackingEnabled = this.siteInfo.privateSiteInfo.isPeriodicPaymentTrackingEnabled;

            this.retrievePaymentHistory();

            window.setTimeout( () => this.$http.get( "/api/DocumentLink/0" ).then( ( response: ng.IHttpPromiseCallbackArg<DocLinkInfo> ) => this.viewExportViewId = response.data.vid ), 250 );

            // Hook up Bootstrap v4 tooltips
            window.setTimeout( () => $( '[data-toggle="tooltip"]' ).tooltip(), 1000 );
        }


        getTodaysPayPeriod()
        {
            // We add 1's to periods because pay periods are 1-based, but Date.getMonth() is 0-based
            let periodValue = new Date().getMonth() + 1;
            let yearValue = new Date().getFullYear();

            if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Quarterly )
            {
                periodValue = Math.floor( new Date().getMonth() / 4 ) + 1;
            }
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Semiannually )
            {
                periodValue = Math.floor( new Date().getMonth() / 6 ) + 1;
            }
            else if( this.assessmentFrequency === AssessmentHistoryController.PeriodicPaymentFrequency_Annually )
            {
                periodValue = 1; // Years only have one pay period
                yearValue = new Date().getFullYear();
            }

            return {
                periodValue,
                yearValue
            };
        }


        onChangePeriodicPaymentTracking(): void
        {
            if( this.isPeriodicPaymentTrackingEnabled === this.siteInfo.privateSiteInfo.isPeriodicPaymentTrackingEnabled )
                return;

            // If the user is enabling the tracking then make sure all units have a payment entered
            if( this.isPeriodicPaymentTrackingEnabled )
            {
                //if( Object.keys(vm.unitPayments).length !== SiteInfo.privateSiteInfo.NumUnits )
                //{
                //    vm.isPeriodicPaymentTrackingEnabled = false;
                //    alert( "You must specify this most recent payment for every unit." );
                //    return;
                //}
            }

            this.siteInfo.privateSiteInfo.isPeriodicPaymentTrackingEnabled = this.isPeriodicPaymentTrackingEnabled;

            this.isLoading = true;

            this.$http.put( "/api/Association/updatePeriodicPaymentTracking?isPeriodicPaymentTrackingEnabled=" + this.isPeriodicPaymentTrackingEnabled, null ).then( () =>
            {
                this.isLoading = false;
            }, () =>
            {
                alert( "Failed to update the payment tracking" );
                this.isLoading = false;
            } );
        }


        /**
         * Add in entries to the payments array so every period has an entry
         */
        fillInEmptyPaymentsForUnit( unit: UnitWithPayment )
        {
            const defaultOwnerUserId = ( unit.owners !== null && unit.owners.length > 0 ) ? unit.owners[0].userId : null;

            const sortedPayments = [];
            let curPeriod = this.startPeriodValue;
            let curYearValue = this.startYearValue;
            for( let periodIndex = 0; periodIndex < this.NumPeriodsVisible; ++periodIndex )
            {
                if( curPeriod < 1 )
                {
                    curPeriod = this.maxPeriodRange;
                    --curYearValue;
                }

                let curPeriodPayment = _.find( unit.allPayments, ( p: any ) => p.period === curPeriod && p.year === curYearValue );

                // If this pay period has not payment entry then add a filler
                if( curPeriodPayment === undefined || curPeriodPayment.isEmptyEntry )
                {
                    curPeriodPayment = {
                        isPaid: false,
                        period: curPeriod,
                        year: curYearValue,
                        amount: unit.assessment,
                        payerUserId: defaultOwnerUserId,
                        paymentDate: new Date(),
                        isEmptyEntry: true
                    };
                }

                sortedPayments.push( curPeriodPayment );

                // curPeriod goes 1-vm.maxPeriodRange
                curPeriod--;
            }

            return sortedPayments;
        }


        /**
         * Add in entries to the payments array so every period has an entry
         */
        fillInEmptyPaymentsForMember( member: PayerInfo ): PeriodicPayment[]
        {
            const sortedPayments: PeriodicPayment[] = [];
            let curPeriod = this.startPeriodValue;
            let curYearValue = this.startYearValue;
            for( let periodIndex = 0; periodIndex < this.NumPeriodsVisible; ++periodIndex )
            {
                if( curPeriod < 1 )
                {
                    curPeriod = this.maxPeriodRange;
                    --curYearValue;
                }

                let curPeriodPayment: PeriodicPayment = _.find( member.enteredPayments, p => p.period === curPeriod && p.year === curYearValue );

                if( curPeriodPayment === undefined || curPeriodPayment.isEmptyEntry )
                {
                    curPeriodPayment = {
                        isPaid: false,
                        paymentId: null,
                        period: curPeriod,
                        year: curYearValue,
                        amount: 0,
                        payerUserId: member.userId,
                        paymentDate: new Date(),
                        isEmptyEntry: true,
                        wePayCheckoutId: null,
                        checkNumber: null,
                        notes: null,
                        payerNotes: null,
                        wePayStatus: null,
                        groupId: null,
                        paymentsInfoId: null
                    };
                }

                sortedPayments.push( curPeriodPayment );

                // curPeriod goes 1-vm.maxPeriodRange
                curPeriod--;
            }

            return sortedPayments;
        }


        viewWePayDetails( wePayCheckoutId: string ): void
        {
            this.appCacheService.set( "hwpid", wePayCheckoutId );
            this.$location.path( "/Financials/OnlinePayments" );
        }


        viewOnlinePaymentDetails( paymentsInfoId: number ): void
        {
            this.appCacheService.set( "onpayid", paymentsInfoId.toString() );
            this.$location.path( "/Financials/OnlinePayments" );
        }


        /**
         * Create a special assessment entry
         */
        addSpecialAssessment(): void
        {
            // JS is 0 based month plus Angular uses strings so move to 1-based integer for the server
            this.createSpecialAssessment = parseInt( this.createSpecialAssessment ) + 1;

            // Create the special assessment
            this.isLoading = true;

            this.$http.post( "/api/PaymentHistory/SpecialAssessment", this.createSpecialAssessment ).then( () =>
            {
                this.isLoading = false;
                this.shouldShowCreateSpecialAssessment = false;

                this.retrievePaymentHistory();

            }, ( httpResponse: ng.IHttpPromiseCallbackArg<Ally.ExceptionResult> ) =>
            {
                this.isLoading = false;

                const errorMessage = httpResponse.data.exceptionMessage ? httpResponse.data.exceptionMessage : httpResponse.data;
                alert( "Failed to add special assessment: " + errorMessage );
            } );
        }


        /**
         * Display the modal to create special assessments
         */
        showCreateSpecialAssessment(): void
        {
            this.shouldShowCreateSpecialAssessment = true;

            this.createSpecialAssessment = {
                year: new Date().getFullYear(),
                month: new Date().getMonth().toString(),
                notes: "",
                amount: null
            };
        }


        /**
         * Go back a few pay periods
         */
        public browsePast(): void
        {
            this.startPeriodValue = this.startPeriodValue - 6;

            while( this.startPeriodValue < 1 )
            {
                this.startPeriodValue = this.maxPeriodRange + this.startPeriodValue;
                --this.startYearValue;
            }

            this.displayPaymentsForRange( this.startYearValue, this.startPeriodValue );
        }


        /**
         * Go ahead a few pay periods
         */
        browseFuture(): void
        {
            this.startPeriodValue = this.startPeriodValue + 6;

            while( this.startPeriodValue > this.maxPeriodRange )
            {
                this.startPeriodValue -= this.maxPeriodRange;
                ++this.startYearValue;
            }

            this.displayPaymentsForRange( this.startYearValue, this.startPeriodValue );
        }


        /**
         * Populate the display for a date range
         */
        displayPaymentsForRange( startYear: number, startPeriod: number ): void
        {
            this.startYearValue = startYear;
            this.startPeriodValue = startPeriod; // Pay period values start at 1, not 0

            this.visiblePeriodNames = [];
            let year = this.startYearValue;

            // Step from left to right in the output columns, going back a pay period each time
            let currentPeriod = this.startPeriodValue;
            for( let columnIndex = 0; columnIndex < this.NumPeriodsVisible; ++columnIndex )
            {
                // If we stepped passed the first period, go the previous year
                if( currentPeriod < 1 )
                {
                    currentPeriod = this.maxPeriodRange;
                    --year;
                }

                let headerName = this.shortPeriodNames[currentPeriod - 1];
                if( currentPeriod === 1 || currentPeriod === this.maxPeriodRange )
                    headerName += " " + year;

                if( this.isForMemberGroup )
                    headerName = year + " - " + ( year + 1 );

                this.visiblePeriodNames.push( {
                    name: headerName,
                    periodValue: currentPeriod,
                    arrayIndex: columnIndex,
                    year: year,
                    isTodaysPeriod: year === this.todaysPayPeriod.yearValue && currentPeriod === this.todaysPayPeriod.periodValue
                } );

                --currentPeriod;
            }

            // Make sure every visible period has an valid entry object
            if( this.isForMemberGroup )
                _.each( this.payers, payer => payer.displayPayments = this.fillInEmptyPaymentsForMember( payer ) );
            else
                this.unitPayments.forEach( ( unit: UnitWithPayment ) => unit.payments = this.fillInEmptyPaymentsForUnit( unit ) );
        }


        /**
         * Populate the payment grid
         */
        retrievePaymentHistory(): void
        {
            this.isLoading = true;

            this.$http.get( "/api/PaymentHistory?oldestDate=" ).then( ( httpResponse: ng.IHttpPromiseCallbackArg<FullPaymentHistory> ) =>
            {
                const paymentInfo = httpResponse.data;

                this.shouldShowFillInSection = this.siteInfo.userInfo.isAdmin || ( paymentInfo.payments.length < 2 && paymentInfo.units.length > 3 );

                // Build the map of unit ID to unit information
                this.unitPayments = new Map<number, UnitWithPayment>();
                _.each( paymentInfo.units, ( unit: UnitWithOwner ) =>
                {
                    this.unitPayments.set( unit.unitId, unit as UnitWithPayment );
                    const curEntry: UnitWithPayment = this.unitPayments.get( unit.unitId );

                    // Only take the first two owners for now
                    curEntry.displayOwners = _.first( unit.owners, 2 );
                    while( curEntry.displayOwners.length < 2 )
                        curEntry.displayOwners.push( { name: "" } );

                    curEntry.payments = [];
                } );

                // Add the payment information to the members
                if( this.isForMemberGroup && httpResponse.data.payers )
                {
                    _.each( httpResponse.data.payers, ( payer ) =>
                    {
                        payer.enteredPayments = _.filter( paymentInfo.payments, p => p.payerUserId === payer.userId );
                    } );
                }

                // Add the payment information to the units
                _.each( paymentInfo.payments, ( payment: AssessmentPayment ) =>
                {
                    if( this.unitPayments.has(payment.unitId) )
                        this.unitPayments.get(payment.unitId).payments.push( payment );
                } );

                // Store all of the payments rather than just what is visible
                _.each( paymentInfo.units, ( unit: UnitWithPayment ) =>
                {
                    // The newest payment will be at the start
                    unit.payments = _.sortBy( unit.payments, p => p.year * 100 + p.period );
                    unit.payments.reverse();
                    
                    unit.allPayments = unit.payments;

                    // Since allPayments is sorted newest first, let's grab the first payment marked as paid
                    const mostRecentPayment = unit.allPayments.find( p => p.isPaid );
                    if( mostRecentPayment )
                    {
                        let numMissedPayments = this.getNumMissedPayments( mostRecentPayment );

                        // If the person is ahead on payments, still show 0 rather than negative due
                        if( numMissedPayments <= 0 )
                            numMissedPayments = 0;

                        unit.estBalance = numMissedPayments * unit.assessment;
                    }
                    else
                        unit.estBalance = undefined;
                } );

                // Sort the units by name
                const sortedUnits: UnitWithPayment[] = Array.from( this.unitPayments.values() );
                this.nameSortedUnitPayments = HtmlUtil2.smartSortStreetAddresses( sortedUnits, "name" );

                this.payers = _.sortBy( paymentInfo.payers, payer => payer.name );

                this.displayPaymentsForRange( this.startYearValue, this.startPeriodValue );

                this.isLoading = false;

            }, ( response: ng.IHttpPromiseCallbackArg<ExceptionResult> ) =>
            {
                this.isLoading = false;
                alert( "Failed to retrieve payment history: " + response.data.exceptionMessage );
            } );
        }


        getNumMissedPayments( mostRecentPayment: AssessmentPayment )
        {
            const todaysPayPeriod = this.getTodaysPayPeriod();

            if( mostRecentPayment.year === todaysPayPeriod.yearValue )
            {
                return todaysPayPeriod.periodValue - mostRecentPayment.period;
            }
            else
            {
                const numYearsBack = todaysPayPeriod.yearValue - mostRecentPayment.year;
                const yearsPaymentsMissed = ( numYearsBack - 1 ) * this.maxPeriodRange;
                const periodsMissedForRecentYear = this.maxPeriodRange - mostRecentPayment.period;
                return todaysPayPeriod.periodValue + yearsPaymentsMissed + periodsMissedForRecentYear;
            }

            return 0;
        }


        /**
         * Get the amount paid by all units in a pay period
         */
        getPaymentSumForPayPeriod( periodIndex: number ): number
        {
            let sum = 0;

            if( AppConfig.isChtnSite )
            {
                const unitIds = Array.from( this.unitPayments.keys() );

                for( let i = 0; i < unitIds.length; ++i )
                {
                    const unitId = unitIds[i];

                    const paymentInfo = this.unitPayments.get(unitId).payments[periodIndex];
                    if( paymentInfo && paymentInfo.isPaid )
                        sum += paymentInfo.amount;
                }
            }
            else
            {
                for( let i = 0; i < this.payers.length; ++i )
                {
                    const paymentInfo = this.payers[i].displayPayments[periodIndex];
                    if( paymentInfo && paymentInfo.isPaid )
                        sum += paymentInfo.amount;
                }
            }

            return sum;
        }


        /**
         * Occurs when the user toggles whether or not to show payment info
         */
        onshowPaymentInfo(): void
        {
            window.localStorage[this.LocalStorageKey_ShowPaymentInfo] = this.showPaymentInfo;
            window.localStorage[this.LocalStorageKey_ShouldColorCodePayments] = this.shouldColorCodePayments;
        }


        /**
         * Occurs when the user toggles whether or not to show the balance column
         */
        onshowBalanceCol(): void
        {
            window.localStorage[this.LocalStorageKey_ShowBalanceCol] = this.shouldShowBalanceCol;
        }


        /**
         * Occurs when the user clicks a date cell
         */
        onUnitPaymentCellClick( unit: any, periodPayment: any ): void
        {
            periodPayment.unitId = unit.unitId;

            this.editPayment = {
                unit: unit,
                payment: _.clone( periodPayment ), // Make a copy of the object so we can edit it without editing the grid
                periodName: this.periodNames[periodPayment.period - 1],
                filteredPayers: _.filter( this.payers, ( payer ) =>
                {
                    return !_.some( unit.owners, ( owner: any ) => owner.userId === payer.userId );
                } )
            };

            setTimeout( () => { $( "#paid-amount-textbox" ).focus(); }, 10 );
        }


        /**
         * Occurs when the user clicks a date cell
         */
        onMemberPaymentCellClick( payer: PayerInfo, periodPayment: PeriodicPayment ): void
        {
            periodPayment.payerUserId = payer.userId;

            this.editPayment = {
                unit: null,
                payment: _.clone( periodPayment ), // Make a copy of the object so we can edit it without editing the grid
                periodName: this.periodNames[periodPayment.period - 1],
                filteredPayers: null
            };

            setTimeout( () => { $( "#paid-amount-textbox" ).focus(); }, 10 );
        }


        onSavePayment(): void
        {
            const onSave = () =>
            {
                this.isSavingPayment = false;

                this.editPayment = null;
                this.retrievePaymentHistory();
            };

            const onError = ( httpResponse: ng.IHttpPromiseCallbackArg<any> ) =>
            {
                this.isSavingPayment = false;

                alert( httpResponse.data.message );
                this.editPayment = null;
            };

            this.isSavingPayment = true;

            if( this.editPayment.payment.paymentId )
            {
                analytics.track( "editAssessmentHistoryPayment" );
                this.$http.put( "/api/PaymentHistory", this.editPayment.payment ).then( onSave, onError );
            }
            else
            {
                analytics.track( "addAssessmentHistoryPayment" );
                this.$http.post( "/api/PaymentHistory", this.editPayment.payment ).then( onSave, onError );
            }
        }


        populatePaidForPeriod(): void
        {
            if( !this.selectedFillInPeriod )
                return;

            const unitIds: number[] = Array.from( this.unitPayments.keys() );

            this.isLoading = true;

            let numPosts = 0;
            for( let i = 0; i < unitIds.length; ++i )
            {
                const unitPayment: UnitWithPayment = this.unitPayments.get(unitIds[i]);

                const paymentEntry = _.find( unitPayment.payments, p => p.year === this.selectedFillInPeriod.year && p.period === this.selectedFillInPeriod.periodValue );
                if( paymentEntry )
                {
                    if( paymentEntry.isPaid )
                        continue;
                }

                const postData = {
                    Year: this.selectedFillInPeriod.year,
                    Period: this.selectedFillInPeriod.periodValue,
                    IsPaid: true,
                    Amount: unitPayment.assessment || 0,
                    PaymentDate: new Date(),
                    PayerUserId: this.siteInfo.userInfo.userId,
                    Notes: "Auto-marking all entries for " + this.selectedFillInPeriod.name.trim(),
                    unitId: unitPayment.unitId
                };

                ++numPosts;

                // Poor man's async for-loop
                window.setTimeout( () => this.$http.post( "/api/PaymentHistory", postData ), numPosts * 350 );
            }

            window.setTimeout( () =>
            {
                this.isLoading = false;
                this.retrievePaymentHistory();
            }, ( numPosts + 1 ) * 350 );
        }


        onExportClick( type: string )
        {
            // Get a new view token in case the user clicks export again
            window.setTimeout( () => this.$http.get( "/api/DocumentLink/0" ).then( ( response: ng.IHttpPromiseCallbackArg<DocLinkInfo> ) => this.viewExportViewId = response.data.vid ), 500 );

            analytics.track( 'exportAssessment' + type );
            return true;
        }


        showBulkSet()
        {
            this.shouldShowFillInSection = true;
            window.scrollTo( 0, 0 );
        }
    }


    class PeriodEntry
    {
        name: string;
        periodValue: number;
        arrayIndex: number;
        year: number;
        isTodaysPeriod: boolean;
    }
}


CA.angularApp.component( "assessmentHistory", {
    templateUrl: "/ngApp/chtn/manager/financial/assessment-history.html",
    controller: Ally.AssessmentHistoryController
} );
