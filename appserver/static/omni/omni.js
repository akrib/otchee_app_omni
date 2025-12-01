var scriptName = 'Omni_Downtime';
var scriptVersion = '0.5.2'; // Version avec amélioration debugging et gestion d'erreurs
console.log('%c %s', 'background: #222; color: #bada55', scriptName + ' Version: ' + scriptVersion);

var app_path = 'otchee_app_omni';
var viewName = '';

require(['splunkjs/mvc/utils'], function (SplunkUtil) {
    viewName = SplunkUtil.getPageInfo().page;
    require.config({
        paths: {
            'jquery-ui': '../app/' + app_path + '/omni/lib/jquery-ui.min',
        },
        shim: {
            'jquery-ui': { deps: ['jquery'] },
        },
    });

    require([
        'underscore',
        'jquery',
        'splunkjs/mvc',
        'splunkjs/mvc/searchmanager',
        'jquery-ui',
        'css!../app/' + app_path + '/omni/lib/semantic.min.css',
        'css!../app/' + app_path + '/omni/lib/jquery-ui.min.css',
        'splunkjs/mvc/simplexml/ready!',
    ], function (_, $, mvc, SearchManager) {

        // ==================== CONSTANTES ====================
        const CONFIG = {
            LOGTITLE: 'Downtime',
            UPDATE_FORM: true,
            SPACING: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
            DATE_FORMAT: 'yy-mm-dd',
            TIME_REGEX: /^24:00|((([01][0-9])|(2[0-3])):[0-5][0-9])$/,
            EMAIL_REGEX: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            PERIOD_FIELDS: {
                TYPE: 0,
                BEGIN_DAY: 1,
                BEGIN_HOUR: 2,
                END_DAY: 3,
                END_HOUR: 4
            },
            DOWNTIME_FIELDS: {
                KEY: 0,
                DOWNTIME: 1,
                SERVICE_TYPE: 2,
                SERVICE: 3,
                KPI_TYPE: 4,
                KPI: 5,
                ENTITY_TYPE: 6,
                ENTITY: 7,
                DT_FILTER: 8,
                COMMENTARY: 9,
                VERSION: 10,
                DT_PATTERN: 11
            },
            WEEK_DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            MONTH_DAYS: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
                '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
                '25', '26', '27', '28', '29', '30', '31']
        };

        var numberTabs = 1;
        var debugMode = $('#debug').html() || 0;
        var token = mvc.Components.get('default', { create: true });

        // ==================== UTILITAIRES ====================
        const Utils = {
            // Logging amélioré
            log(obj, titre = '', level = 0) {
                if (debugMode != 1) return;
                
                const colors = ['#FFFFFF', '#FFFF00', '#FF0000'];
                const tags = ['Info', 'Warn', 'Crit'];
                const tag = CONFIG.LOGTITLE + ' ' + tags[level] || '';
                
                console.groupCollapsed('%c %s', 'background: #000000; color: ' + colors[level], tag + '--' + titre + '--');
                
                try {
                    if (Array.isArray(obj)) {
                        console.table(obj);
                    } else {
                        [console.info, console.warn, console.error][level](obj);
                    }
                } catch (err) {
                    console.error(err);
                }
                
                console.groupEnd();
            },

            // Validation
            isNull(variable) {
                return variable === "" || variable === null || variable === undefined || 
                       variable === false || variable === 0 || 
                       (!parseFloat(variable) && variable != 0 && typeof variable === "number");
            },

            isNotNull(variable) {
                return !this.isNull(variable);
            },

            // Génération d'ID unique
            createID() {
                const crypto = window.crypto || window.msCrypto;
                var array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return (Date.now().toString(36) + crypto.getRandomValues(array).toString(36).substr(2, 5)).toUpperCase();
            },

            // Validation email
            checkEmail(email) {
                return CONFIG.EMAIL_REGEX.test(String(email).toLowerCase());
            },

            // Pause
            applySleep(milliseconds) {
                var start = new Date().getTime();
                for (var i = 0; i < 1e7; i++) {
                    if (new Date().getTime() - start > milliseconds) break;
                }
            },

            // Date du jour
            getTodayDate() {
                var today = new Date();
                var dd = String(today.getDate()).padStart(2, '0');
                var mm = String(today.getMonth() + 1).padStart(2, '0');
                var yy = today.getFullYear();
                return yy + '-' + mm + '-' + dd;
            },

            // Échappement amélioré pour SPL
            escapeSPLString(value) {
                try {
                    if (this.isNull(value)) {
                        return '';
                    }
                    
                    // Convertir en string si ce n'est pas déjà le cas
                    var str = String(value);
                    
                    // Échapper les backslashes d'abord (important de le faire en premier)
                    str = str.replace(/\\/g, '\\\\');
                    
                    // Échapper les guillemets doubles
                    str = str.replace(/"/g, '\\"');
                    
                    // Échapper les retours à la ligne
                    str = str.replace(/\n/g, '\\n');
                    str = str.replace(/\r/g, '\\r');
                    
                    // Échapper les tabulations
                    str = str.replace(/\t/g, '\\t');
                    
                    return str;
                } catch (error) {
                    this.log(error, 'Erreur dans escapeSPLString', 2);
                    return '';
                }
            }
        };

        // ==================== GESTION DES TOKENS ====================
        const TokenManager = {
            set(tokenName, tokenValue, updateForm = false) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    defaultTokenModel.set(tokenName, tokenValue);
                    submittedTokenModel.set(tokenName, tokenValue);
                    
                    if (updateForm) {
                        defaultTokenModel.set('form.' + tokenName, tokenValue);
                        submittedTokenModel.set('form.' + tokenName, tokenValue);
                    }
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.set', 2);
                }
            },

            unset(tokenName) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    defaultTokenModel.unset(tokenName);
                    submittedTokenModel.unset(tokenName);
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.unset', 2);
                }
            },

            get(tokenName) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    var def = defaultTokenModel.get(tokenName);
                    var sub = submittedTokenModel.get(tokenName);
                    
                    return Utils.isNotNull(def) ? def : (Utils.isNotNull(sub) ? sub : null);
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.get', 2);
                    return null;
                }
            }
        };

        // ==================== TRANSFORMATIONS DE TEXTE ====================
        const TextTransformer = {
            // Transformation pour KV Store
            forKV(value) {
                if (!value) return value;
                return value.replace(',', ';').replace('%', '*');
            },

            // Retrait des accents
            removeAccents(text) {
                const find = ['à', 'á', 'â', 'ã', 'ä', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï', 
                    'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ù', 'ú', 'û', 'ü', 'ý', 'ÿ',
                    'À', 'Á', 'Â', 'Ã', 'Ä', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï', 
                    'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ù', 'Ú', 'Û', 'Ü', 'Ý'];
                
                const replace = ['a', 'a', 'a', 'a', 'a', 'c', 'e', 'e', 'e', 'e', 'i', 'i', 'i', 'i',
                    'n', 'o', 'o', 'o', 'o', 'o', 'u', 'u', 'u', 'u', 'y', 'y',
                    'A', 'A', 'A', 'A', 'A', 'C', 'E', 'E', 'E', 'E', 'I', 'I', 'I', 'I',
                    'N', 'O', 'O', 'O', 'O', 'O', 'U', 'U', 'U', 'U', 'Y'];

                var result = text;
                for (var i = 0; i < find.length; i++) {
                    result = result.replace(new RegExp(find[i], 'g'), replace[i]);
                }
                
                result = result.replace(/[^a-zA-Z0-9_-]/g, ' ');
                return result.toLowerCase().trim();
            },

            // Jours en anglais
            daysToEnglish(text) {
                const translations = {
                    'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday',
                    'Jeudi': 'Thursday', 'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday'
                };
                
                var result = text;
                Object.keys(translations).forEach(key => {
                    result = result.replace(key, translations[key]);
                });
                return result;
            },

            // Tags visuels
            toVisualTags(itemString) {
                try {
                    if (Utils.isNull(itemString)) return '';
                    
                    if (itemString == '%') itemString = 'Tous';
                    
                    var items = itemString.replace("%", "*").split(';');
                    return items.map(item => '<span class="description_item">' + item + '</span>').join('');
                } catch (error) {
                    Utils.log(error, 'Error in toVisualTags', 2);
                    return '';
                }
            }
        };

        // ==================== VALIDATION ====================
        const Validator = {
            // Validation format heure
            timeFormat(timestr) {
                return CONFIG.TIME_REGEX.test(timestr);
            },

            // Vérification date de fin > date de début
            endAfterBegin(dayBegin, dayEnd, begin, end) {
                if (String(dayBegin) !== String(dayEnd)) return false;
                
                var beginSplit = begin.split(':');
                var endSplit = end.split(':');
                
                var dateBegin = new Date(2001, 0, 1, parseInt(beginSplit[0], 10), parseInt(beginSplit[1], 10), 0);
                var dateEnd = new Date(2001, 0, 1, parseInt(endSplit[0], 10), parseInt(endSplit[1], 10), 0);
                
                return dateBegin.valueOf() > dateEnd.valueOf();
            },

            // Validation complète des datepickers
            allDatepickers() {
                var errorMessages = '';
                var periodNumber = 1;
                
                Utils.log('Début validation datepickers', 'allDatepickers');
                
                $('[id^=content-tab-Period]').each(function () {
                    Utils.log('Validation période ' + periodNumber, 'allDatepickers');
                    
                    if ($(this).find('[periodID=radioD]').is(':checked')) {
                        var dateBegin = $(this).find('[id^=datepicker_begin]').val();
                        var dateEnd = $(this).find('[id^=datepicker_end]').val();
                        
                        Utils.log({dateBegin: dateBegin, dateEnd: dateEnd}, 'Dates période ' + periodNumber);
                        
                        var dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
                        
                        if (!dateBegin || dateBegin.trim() === '') {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de début est obligatoire<br />';
                        }
                        
                        if (!dateEnd || dateEnd.trim() === '') {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de fin est obligatoire<br />';
                        }
                        
                        if (dateBegin && !dateFormatRegex.test(dateBegin)) {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : Format de date de début invalide<br />';
                        }
                        
                        if (dateEnd && !dateFormatRegex.test(dateEnd)) {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : Format de date de fin invalide<br />';
                        }
                        
                        if (dateBegin && dateEnd && dateFormatRegex.test(dateBegin) && dateFormatRegex.test(dateEnd)) {
                            if (new Date(dateEnd) < new Date(dateBegin)) {
                                errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de fin doit être postérieure à la date de début<br />';
                            }
                        }
                    }
                    periodNumber++;
                });
                
                if (errorMessages) {
                    errorMessages = '<b>Impossible de valider le downtime :</b><br /><br />' + errorMessages;
                }
                
                Utils.log(errorMessages, 'Résultat validation datepickers');
                
                return errorMessages;
            }
        };

        // ==================== GESTION DES DATES ====================
        const DatePickerManager = {
            apply(minDate = Utils.getTodayDate(), div = '') {
                var from = $(div + '[id^=datepicker_begin]')
                    .datepicker({
                        defaultDate: '+1w',
                        changeMonth: true,
                        numberOfMonths: 1,
                        dateFormat: CONFIG.DATE_FORMAT,
                        minDate: minDate,
                        onSelect: function(dateText) {
                            var selectedDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, dateText);
                            if (selectedDate) {
                                DatePickerManager.enableEnd(to, selectedDate);
                                DatePickerManager.checkEndDateValidity(to, selectedDate);
                            }
                        }
                    })
                    .on('change', function () {
                        var selectedDate = DatePickerManager.getDate(this);
                        if (selectedDate) {
                            DatePickerManager.enableEnd(to, selectedDate);
                            DatePickerManager.checkEndDateValidity(to, selectedDate);
                        } else {
                            DatePickerManager.disableEnd(to);
                        }
                    });
                
                var to = $(div + '[id^=datepicker_end]')
                    .datepicker({
                        defaultDate: '+1w',
                        changeMonth: true,
                        numberOfMonths: 1,
                        dateFormat: CONFIG.DATE_FORMAT,
                        minDate: minDate,
                        onSelect: function(dateText) {
                            var selectedDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, dateText);
                            if (selectedDate) {
                                from.datepicker('option', 'maxDate', selectedDate);
                                DatePickerManager.validateEndDate(from, $(this), selectedDate);
                            }
                        }
                    })
                    .prop('disabled', true)
                    .css({
                        'background-color': '#e9ecef',
                        'cursor': 'not-allowed',
                        'opacity': '0.6'
                    })
                    .on('change', function () {
                        var selectedDate = DatePickerManager.getDate(this);
                        if (selectedDate) {
                            from.datepicker('option', 'maxDate', selectedDate);
                            DatePickerManager.validateEndDate(from, $(this), selectedDate);
                        }
                    });
                
                // Initialisation si valeur existante
                var fromValue = from.val();
                if (fromValue && fromValue.length > 0) {
                    try {
                        var fromDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, fromValue);
                        if (fromDate) DatePickerManager.enableEnd(to, fromDate);
                    } catch(e) {
                        Utils.log(e, 'Erreur parsing date initiale', 1);
                    }
                }
            },

            enableEnd(toElement, selectedDate) {
                toElement.prop('disabled', false);
                toElement.css({
                    'background-color': '#ffffff',
                    'cursor': 'pointer',
                    'opacity': '1'
                });
                toElement.datepicker('option', 'minDate', selectedDate);
                toElement.datepicker('option', 'disabled', false);
            },

            disableEnd(toElement) {
                toElement.prop('disabled', true);
                toElement.css({
                    'background-color': '#e9ecef',
                    'cursor': 'not-allowed',
                    'opacity': '0.6'
                });
                toElement.val('');
                toElement.datepicker('option', 'disabled', true);
            },

            checkEndDateValidity(toElement, selectedDate) {
                var endDate = toElement.val();
                if (endDate) {
                    var endDateObj = $.datepicker.parseDate(CONFIG.DATE_FORMAT, endDate);
                    if (endDateObj < selectedDate) {
                        toElement.val('');
                        Utils.log('Date de fin réinitialisée', 'checkEndDateValidity', 1);
                    }
                }
            },

            validateEndDate(fromElement, toElement, selectedDate) {
                var beginDate = fromElement.val();
                if (beginDate) {
                    var beginDateObj = $.datepicker.parseDate(CONFIG.DATE_FORMAT, beginDate);
                    if (beginDateObj > selectedDate) {
                        toElement.val('');
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', 'La date de fin ne peut pas être inférieure à la date de début.');
                        $('#modal_link')[0].click();
                    }
                }
            },

            getDate(element) {
                try {
                    return $.datepicker.parseDate(CONFIG.DATE_FORMAT, element.value);
                } catch (error) {
                    return null;
                }
            }
        };

        // ==================== SPINNER DE CHARGEMENT ====================
        const LoadSpinner = {
            state(state) {
                if ($('#loadSpinner').length == 0) {
                    console.log('%c LoadSpinner: div inexistante', 'background: #222; color: #FF0000');
                    return;
                }

                if (state == 'ON') {
                    if ($('#loadSpinner_circle').length != 0) return;
                    
                    var msg = $('#loadSpinner').attr('loading_msg') || 'Chargement en cours';
                    var color = $('#loadSpinner').attr('circle_color') || '#FF0000';
                    
                    var style = `
                        #loadSpinner_circle {
                            margin: 0 auto;
                            border: 5px solid transparent;
                            border-top: 5px solid ${color};
                            border-radius: 50%;
                            width: 50px;
                            height: 50px;
                            animation: spin 1s linear infinite;
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        .progress-bar { visibility: hidden!important; }
                    `;
                    
                    $('#loadSpinner').append('<style>' + style + '</style>');
                    $('#loadSpinner').append('<center><div id="loadSpinner_msg">' + msg + '</div></center>');
                    $('#loadSpinner').append('<center><div id="loadSpinner_circle"/></center>');
                } else {
                    $('#loadSpinner').html('');
                }
            },

            changeMsg(text) {
                if ($('#loadSpinner_msg').length != 0) {
                    $('#loadSpinner_msg').html(text);
                }
            }
        };

        // ==================== INTERFACE UTILISATEUR ====================
        const UIManager = {
            create() {
                if (Utils.isNotNull($('#downtime > .Omni_base').val())) {
                    Utils.log('', 'UI déjà existante');
                    return;
                }

                var userName = Splunk.util.getConfigValue('USERNAME');
                var dashboardType = $('#dashboardType').html();
                var downtimeType = $('#downtimeType').html();
                var html = `
                    <div class="ui Omni_base">
                        <table id="Omni_table">
                            <tr><td width="100%">
                                <div class="ui small form segment Omni_segment">
                                    <div id="tabs">
                                        <div class="ui menu tabsName Omni_tabsName">
                                            <div class="ui label blue item Omni_itemName"></div>
                                            <a class="item tabx" id="tAdd"></a>
                                        </div>
                                    </div>
                                    <div id="content" class="Omni_content"></div>
                                </div>
                                <label>Commentaire ou numéro de ticket</label>
                            </td></tr>
                            <tr><td>
                                <textarea class="Omni_commentaire" id="commentaire" cols="300" rows="3"></textarea>
                            </td></tr>
                        </table>
                        <input id="CANCEL_button" type="button" value="Annuler" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">
                        <input id="VALID_button" type="button" value="Valider" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">
                        ${debugMode == '1' ? '<input id="TEST_button" type="button" value="Test" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">' : ''}
                        <br/>
                        <center><div id="loadSpinner" loading_msg=" " circle_color="#A64764" /></center>
                    </div>
                `;
                
                $('#downtime').html(html);
                $('#username').html(userName);
            },

            appendPeriodTab(tab, nombre, downtimeType = 'between_date', beginDays = '', beginHours = '00:00:00', endDays = '', endHours = '24:00:00') {
                Utils.log([tab, nombre, downtimeType], 'appendPeriodTab');

                var checks = {
                    between_date: downtimeType == 'between_date' ? 'checked="checked"' : '',
                    weekly: downtimeType == 'weekly' ? 'checked="checked"' : '',
                    monthly: downtimeType == 'monthly' ? 'checked="checked"' : '',
                    special_date: UIManager.cutStringForSpecialDate(downtimeType) == 'special_date' ? 'checked="checked"' : ''
                };

                var base = 'tab-Periode' + numberTabs.toString();
                var n = nombre || 'tab ' + numberTabs.toString();
                var tn = nombre ? nombre.replace(/\s/g, '') : 'tab' + numberTabs.toString();

                $('.tab-content').removeClass('current');

                var form = `
                    <div>
                        <form id="form-${base}" class="radiobasis">
                            Date à date <input type="radio" periodID="radioD" name="basis-${base}" value="between_date" ${checks.between_date}>${CONFIG.SPACING}
                            Hebdomadaire <input type="radio" periodID="radioW" name="basis-${base}" value="weekly" ${checks.weekly}>${CONFIG.SPACING}
                            Mensuel <input type="radio" periodID="radioM" name="basis-${base}" value="monthly" ${checks.monthly}>${CONFIG.SPACING}
                            Spécifique <input type="radio" periodID="radioS" name="basis-${base}" value="special_date" ${checks.special_date}>
                        </form>
                    </div><br />
                `;

                var content = `
                    <div id="content-${base}" class="tab-content current">
                        ${form}
                        <div id="table-${base}">
                            ${UIManager.createPeriodContent(base, downtimeType, beginDays, beginHours, endDays, endHours)}
                        </div>
                    </div>
                `;

                numberTabs++;
                
                if (!$('#tab-' + tn).length) {
                    $('#content').append(content);
                    var t = $('#' + tab + ' .tabsName');
                    t.find('#tAdd').remove();
                    
                    var tabItem = `
                        <a class="item tab" data-tab="${tn}" id="tab-${tn}">
                            ${n} <i class="times icon btnx" id="btnx-${tn}"></i>
                        </a>
                        <a class="item tabx" id="tAdd"><i class="add square icon"></i></a>
                    `;
                    t.append(tabItem);
                }
                $('#tab-' + tn).click();
            },

            createPeriodContent(name, choice, beginDays = '', beginHours = '00:00:00', endDays = '', endHours = '24:00:00') {
                beginHours = beginHours.substr(0, 5);
                endHours = endHours.substr(0, 5);
                
                if (choice == 'between_date') {
                    return UIManager.createBetweenDateContent(name, beginDays, beginHours, endDays, endHours);
                } else if (choice == 'weekly') {
                    return UIManager.createWeeklyContent(name, beginDays, beginHours, endHours);
                } else if (choice == 'monthly') {
                    return UIManager.createMonthlyContent(name, beginDays, beginHours, endHours);
                } else if (UIManager.cutStringForSpecialDate(choice) == 'special_date') {
                    return UIManager.createSpecialDateContent(name, beginDays, beginHours, endHours, choice);
                }
                return '';
            },

            createBetweenDateContent(name, beginDays, beginHours, endDays, endHours) {
                return `
                    <div><table id="omni_periode">
                        <tr>
                            <td>Date de début</td>
                            <td><input type="text" id="datepicker_begin-${name}" readonly value="${beginDays}"></td>
                            <td>Heure de début</td>
                            <td><input type="text" id="begin${name}" class="inputPeriodBegin" name="begin" required minlength="5" maxlength="5" size="7" value="${beginHours}"></td>
                        </tr>
                        <tr>
                            <td>Date de fin</td>
                            <td><input type="text" id="datepicker_end-${name}" readonly value="${endDays}"></td>
                            <td>Heure de fin</td>
                            <td><input type="text" id="end${name}" class="inputPeriodEnd" name="end" required minlength="5" maxlength="5" size="7" value="${endHours}"></td>
                        </tr>
                    </table></div>
                `;
            },

            createWeeklyContent(name, beginDays, beginHours, endHours) {
                var daysHtml = CONFIG.WEEK_DAYS.map(day => 
                    `<li class="ui-state-default${UIManager.matchDays(beginDays, day, ' ui-selected')}">${day}</li>`
                ).join('');

                return `
                    <div><table id="omni_periode">
                        <tr>
                            <td>Jours</td>
                            <td><ol id="selectable_1-${name}">${daysHtml}</ol></td>
                        </tr>
                        <tr>
                            <td>Période de temps</td>
                            <td>
                                <table>
                                    <tr><td>Début</td><td><input type="text" id="begin${name}" class="inputPeriodBegin" name="begin" required minlength="5" maxlength="5" size="7" value="${beginHours}"></td></tr>
                                    <tr><td>Fin</td><td><input type="text" id="end${name}" class="inputPeriodEnd" name="end" required minlength="5" maxlength="5" size="7" value="${endHours}"></td></tr>
                                </table>
                            </td>
                        </tr>
                    </table></div>
                `;
            },

            createMonthlyContent(name, beginDays, beginHours, endHours) {
                var daysHtml = CONFIG.MONTH_DAYS.map(day => 
                    `<li class="ui-state-default${UIManager.matchDays(beginDays, day, ' ui-selected')}">${day}</li>`
                ).join('');

                return `
                    <div><table>
                        <tr>
                            <td>Jours</td>
                            <td>
                                <table width=450>
                                    <tr><td><ol id="selectable_list-${name}">${daysHtml}</ol></td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td>Période de temps</td>
                            <td>
                                <table>
                                    <tr><td>Début</td><td><input type="text" size="7" id="begin${name}" class="inputPeriodBegin" name="begin" value="${beginHours}"></td></tr>
                                    <tr><td>Fin</td><td><input type="text" size="7" id="end${name}" class="inputPeriodEnd" name="end" value="${endHours}"></td></tr>
                                </table>
                            </td>
                        </tr>
                    </table></div>
                `;
            },

            createSpecialDateContent(name, beginDays, beginHours, endHours, choice) {
                var dayOptions = CONFIG.WEEK_DAYS.map(day => 
                    `<option value="${day}" ${UIManager.matchDays(beginDays, day, 'selected')}>${day}</option>`
                ).join('');

                var typeOptions = [
                    ['first', 'special_date_first_in_month', 'Premier du mois'],
                    ['second', 'special_date_second_in_month', 'Deuxieme du mois'],
                    ['third', 'special_date_third_in_month', 'Troisieme du mois'],
                    ['fourth', 'special_date_fourth_in_month', 'Quatrieme du mois'],
                    ['last', 'special_date_last_in_month', 'Dernier du mois']
                ].map(([value, key, label]) => 
                    `<option value="${value}" ${UIManager.matchDays(choice, key, 'selected')}>${label}</option>`
                ).join('');

                return `
                    <div><table>
                        <tr>
                            <td>Jours</td>
                            <td>
                                <select id="select_day" name="select_day">${dayOptions}</select>&nbsp;
                                <select id="select_type" name="select_type">${typeOptions}</select>
                            </td>
                        </tr>
                        <tr><td>Période de temps</td></tr>
                        <table>
                            <tr><td>Début</td><td><input type="text" size="7" id="begin${name}" class="inputPeriodBegin" name="begin" value="${beginHours}"></td></tr>
                            <tr><td>Fin</td><td><input type="text" size="7" id="end${name}" class="inputPeriodEnd" name="end" value="${endHours}"></td></tr>
                        </table>
                    </table></div>
                `;
            },

            cutStringForSpecialDate(text) {
                if (Utils.isNull(text)) return '';
                return text.length > 12 ? text.substr(0, 12) : text;
            },

            matchDays(text, day, result) {
                try {
                    var found = text.match(day);
                    if (Utils.isNotNull(found) && found[0] == day) {
                        return result;
                    }
                } catch (error) {
                    return '';
                }
                return '';
            },

            updateDescriptionDiv() {
                var service_selected = TokenManager.get('service_selected');
                var kpi_selected = TokenManager.get('kpi_selected');
                var entity_selected = TokenManager.get('entity_selected');
                var dt_filterToken = TokenManager.get('dt_filter_selected') || '';
                var dt_patternToken = TokenManager.get('dt_pattern_selected') || '';
                var dashboardType = $('#dashboardType').html();
                
                // Construction du HTML de base avec les sélections
                var selectionDescHtml = `
                    <table id="selection_desc_table" width="100%">
                        <tr><td width="150"><strong>Service(s)</strong></td><td width="20"></td><td>${TextTransformer.toVisualTags(service_selected)}</td></tr>
                        <tr><td><strong>KPI(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(kpi_selected)}</td></tr>
                        <tr><td><strong>Entity(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(entity_selected)}</td></tr>
                `;
                
                // Ajout des filtres personnalisés si présents
                if (Utils.isNotNull(dt_filterToken) && dt_filterToken !== '') {
                    selectionDescHtml += `<tr><td><strong>Custom filter(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(dt_filterToken)}</td></tr>`;
                }
                
                // Ajout des patterns si présents
                if (Utils.isNotNull(dt_patternToken) && dt_patternToken !== '') {
                    selectionDescHtml += `<tr><td><strong>Pattern(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(dt_patternToken)}</td></tr>`;
                }
                
                // Ajout des périodes seulement si ce n'est pas un delete
                if (dashboardType !== 'delete') {
                    var periodsHtml = UIManager.buildPeriodsDescription();
                    if (periodsHtml !== '') {
                        selectionDescHtml += `<tr><td colspan="3"><br/><strong>Périodes de maintenance :</strong></td></tr>`;
                        selectionDescHtml += periodsHtml;
                    }
                }
                
                selectionDescHtml += `</table>`;

                if (Utils.isNotNull(selectionDescHtml)) {
                    $('#selection_desc').html(selectionDescHtml);
                }
            },

            buildPeriodsDescription() {
                var periodsHtml = '';
                var periodNumber = 1;
                
                $('[id^=content-tab-Period]').each(function() {
                    var periodDesc = '';
                    var periodType = '';
                    
                    // Détection du type de période
                    if ($(this).find('[periodID=radioD]').is(':checked')) {
                        var dateBegin = $(this).find('[id^=datepicker_begin]').val();
                        var dateEnd = $(this).find('[id^=datepicker_end]').val();
                        var timeBegin = $(this).find('.inputPeriodBegin').val();
                        var timeEnd = $(this).find('.inputPeriodEnd').val();
                        
                        if (dateBegin && dateEnd) {
                            periodType = 'Date à date';
                            periodDesc = `Du <strong>${dateBegin} ${timeBegin}</strong> au <strong>${dateEnd} ${timeEnd}</strong>`;
                        }
                    } 
                    else if ($(this).find('[periodID=radioW]').is(':checked')) {
                        var days = [];
                        $(this).find('.ui-selected').each(function() {
                            days.push($(this).html());
                        });
                        var timeBegin = $(this).find('.inputPeriodBegin').val();
                        var timeEnd = $(this).find('.inputPeriodEnd').val();
                        
                        if (days.length > 0) {
                            periodType = 'Hebdomadaire';
                            periodDesc = `Les <strong>${days.join(', ')}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                        }
                    }
                    else if ($(this).find('[periodID=radioM]').is(':checked')) {
                        var days = [];
                        $(this).find('.ui-selected').each(function() {
                            days.push($(this).html());
                        });
                        var timeBegin = $(this).find('.inputPeriodBegin').val();
                        var timeEnd = $(this).find('.inputPeriodEnd').val();
                        
                        if (days.length > 0) {
                            periodType = 'Mensuel';
                            periodDesc = `Les jours <strong>${days.join(', ')}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                        }
                    }
                    else if ($(this).find('[periodID=radioS]').is(':checked')) {
                        var day = $(this).find('#select_day').val();
                        var type = $(this).find('#select_type option:selected').text();
                        var timeBegin = $(this).find('.inputPeriodBegin').val();
                        var timeEnd = $(this).find('.inputPeriodEnd').val();
                        
                        if (day && type) {
                            periodType = 'Spécifique';
                            periodDesc = `<strong>${type}</strong> <strong>${day}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                        }
                    }
                    
                    // Ajout de la période si elle est valide
                    if (periodDesc !== '') {
                        periodsHtml += `
                            <tr>
                                <td style="padding-left: 20px;"><em>Période ${periodNumber}</em></td>
                                <td></td>
                                <td><span class="description_item">${periodType}</span> ${periodDesc}</td>
                            </tr>
                        `;
                        periodNumber++;
                    }
                });
                
                return periodsHtml;
            }
        };

        // ==================== GESTION DES REQUÊTES ====================
        const QueryBuilder = {
            withDowntimeID(downtimeID) {
                return `| inputlookup omni_kv_def where ID="${downtimeID}"
                    | rename _key as key
                    | rex field=step_opt "(?<service_type>.)(?<kpi_type>.)(?<entity_type>.)"
                    | eval downtime=mvjoin(downtime,"£"),
                        service=mvjoin(service,";"),
                        kpi=mvjoin(kpi,";"),
                        entity=mvjoin(entity,";")
                    | table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,dt_filter,dt_pattern,commentary,version`;
            },

            createAdd(arr) {
                return QueryBuilder.createQuery(arr, 'add');
            },

            createUpdate(arr) {
                return QueryBuilder.createQuery(arr, 'update');
            },

            createDelete(arr) {
                return QueryBuilder.createQuery(arr, 'delete');
            },

            createQuery(arr, action) {
                try {
                    Utils.log('Début createQuery', 'QueryBuilder');
                    Utils.log({arr: arr, action: action}, 'Paramètres createQuery');
                    
                    var dt_update = new Date().getTime();
                    var array_status = arr['downtimeFields'].map(() => action === 'delete' ? 'disabled' : 'enabled');
                    
                    Utils.log(arr['downtimeFields'], 'downtimeFields avant transformation');
                    
                    // Transformation des downtimeFields en objets JSON
                    var downtimeJsonArray = arr['downtimeFields'].map((field, index) => {
                        var parts = field.split('#');
                        return {
                            id: arr['ID'] + '_' + (index + 1),
                            dt_type: parts[CONFIG.PERIOD_FIELDS.TYPE] || '',
                            begin_date: parts[CONFIG.PERIOD_FIELDS.BEGIN_DAY] || '',
                            end_date: parts[CONFIG.PERIOD_FIELDS.END_DAY] || '',
                            begin_time: parts[CONFIG.PERIOD_FIELDS.BEGIN_HOUR] || '',
                            end_time: parts[CONFIG.PERIOD_FIELDS.END_HOUR] || '',
                            dt_filter: arr['dt_filter'] || '',
                            dt_pattern: arr['dt_pattern'] || ''
                        };
                    });
                    
                    Utils.log(downtimeJsonArray, 'downtimeJsonArray créé');
                    
                    // Conversion en chaîne JSON - SANS double échappement
                    var downtimeJsonString = JSON.stringify(downtimeJsonArray);
                    Utils.log(downtimeJsonString, 'JSON string avant échappement');
                    
                    // Échapper pour SPL (une seule fois)
                    downtimeJsonString = downtimeJsonString
                        .replace(/\\/g, '\\\\')
                        .replace(/"/g, '\\"');
                    
                    Utils.log(downtimeJsonString, 'JSON string après échappement');
                    
                    var baseQuery = `| stats count as service
            | eval service=split("${Utils.escapeSPLString(arr['service'])}",";"),
                kpi=split("${Utils.escapeSPLString(arr['kpi'])}",";"),
                entity=split("${Utils.escapeSPLString(arr['entity'])}",";"),
                dt_filter="${Utils.escapeSPLString(arr['dt_filter'])}",
                dt_pattern="${Utils.escapeSPLString(arr['dt_pattern'] || '')}",
                downtime="${downtimeJsonString}",
                creator="${Utils.escapeSPLString(arr['username'])}",
                commentary="${Utils.escapeSPLString(arr['commentary'])}",
                version="${arr['version']}",
                ID="${arr['ID']}",
                dt_update=${dt_update},
                step_opt="${arr['step_opt']}",
                status=split("${array_status}",",")`;

                    if (action !== 'add') {
                        baseQuery = `| stats count as service
            | eval key="${arr['key']}",
                service=split("${Utils.escapeSPLString(arr['service'])}",";"),
                kpi=split("${Utils.escapeSPLString(arr['kpi'])}",";"),
                entity=split("${Utils.escapeSPLString(arr['entity'])}",";"),
                dt_filter="${Utils.escapeSPLString(arr['dt_filter'])}",
                dt_pattern="${Utils.escapeSPLString(arr['dt_pattern'] || '')}",
                downtime="${downtimeJsonString}",
                creator="${Utils.escapeSPLString(arr['username'])}",
                commentary="${Utils.escapeSPLString(arr['commentary'])}",
                version="${arr['version']}",
                ID="${arr['ID']}",
                dt_update=${dt_update},
                step_opt="${arr['step_opt']}",
                status=split("${array_status}",",")`;
                    }
                    
                    var finalQuery = `${baseQuery} | OmniKVUpdate action="${action}" ${arr['sendEmail']}`;
                    
                    Utils.log(finalQuery, '=== QUERY FINALE GÉNÉRÉE ===', 0);
                    
                    return finalQuery;
                    
                } catch (error) {
                    Utils.log(error, 'ERREUR CRITIQUE dans createQuery', 2);
                    console.error('Stack trace:', error.stack);
                    throw error;
                }
            }
        };

        // ==================== GESTION DES DONNÉES ====================
        const DataManager = {
            fillDashboard(downtimeData, dashboardType) {
                Utils.log([downtimeData, dashboardType], 'fillDashboard');

                downtimeData.forEach(function (row) {
                    var service = row[CONFIG.DOWNTIME_FIELDS.SERVICE];
                    var kpi = row[CONFIG.DOWNTIME_FIELDS.KPI];
                    var entity = row[CONFIG.DOWNTIME_FIELDS.ENTITY];
                    var dt_filter = row[CONFIG.DOWNTIME_FIELDS.DT_FILTER];
                    var dt_pattern = row[CONFIG.DOWNTIME_FIELDS.DT_PATTERN] || '';
                    var service_type = row[CONFIG.DOWNTIME_FIELDS.SERVICE_TYPE];
                    var kpi_type = row[CONFIG.DOWNTIME_FIELDS.KPI_TYPE];
                    var entity_type = row[CONFIG.DOWNTIME_FIELDS.ENTITY_TYPE];
                    var downtime = row[CONFIG.DOWNTIME_FIELDS.DOWNTIME];
                    var commentary = row[CONFIG.DOWNTIME_FIELDS.COMMENTARY];

                    TokenManager.set('selected_version', row[CONFIG.DOWNTIME_FIELDS.VERSION]);
                    TokenManager.set('key', row[CONFIG.DOWNTIME_FIELDS.KEY]);
                    
                    DataManager.setTypeTokens('service', service, service_type, dashboardType);
                    DataManager.setTypeTokens('kpi', kpi, kpi_type, dashboardType);
                    DataManager.setTypeTokens('entity', entity, entity_type, dashboardType);
                    TokenManager.set('dt_filter', dt_filter);
                    TokenManager.set('dt_pattern', dt_pattern);
                    
                    if (dashboardType == "update") {
                        DataManager.updatePeriods(downtime, commentary);
                        TokenManager.set('update_full_loading', 1);
                    } else if (dashboardType == "delete") {
                        TokenManager.set("downtime_selected", downtime);
                        DataManager.updatePeriods(downtime, commentary);
                        UIManager.updateDescriptionDiv();
                        TokenManager.set('update_full_loading', 1);
                        TokenManager.set('step_opt_for_delete', service_type.toString() + kpi_type.toString() + entity_type.toString());
                    }
                });
            },

            setTypeTokens(prefix, value, type, dashboardType) {
                TokenManager.set(prefix + '_selected', value);
                TokenManager.set(prefix + '_select_input_type', type, CONFIG.UPDATE_FORM);
                
                if (type == 2 && dashboardType == "update") {
                    TokenManager.set(prefix + '_for_concat', value.replace(';', ','));
                    TokenManager.set(prefix + '_concat', value, CONFIG.UPDATE_FORM);
                    TokenManager.set(prefix + '_select_dual', '  ');
                } else {
                    TokenManager.unset(prefix + '_select_dual');
                    if (type == 3) {
                        TokenManager.set(prefix + '_text_selected', value, CONFIG.UPDATE_FORM);
                    }
                }
            },

            updatePeriods(text, commentary) {
                UIManager.create();
                
                var allPeriods = text.split('£');
                Utils.log(allPeriods, 'downtime array');
                
                for (var i = 0; i < allPeriods.length; i++) {
                    var periodValue = allPeriods[i].split('#');
                    var periodNumber = (i + 1).toString();
                    
                    UIManager.appendPeriodTab(
                        'tabs',
                        'Periode ' + periodNumber,
                        periodValue[CONFIG.PERIOD_FIELDS.TYPE],
                        periodValue[CONFIG.PERIOD_FIELDS.BEGIN_DAY],
                        periodValue[CONFIG.PERIOD_FIELDS.BEGIN_HOUR],
                        periodValue[CONFIG.PERIOD_FIELDS.END_DAY],
                        periodValue[CONFIG.PERIOD_FIELDS.END_HOUR]
                    );
                    
                    if (periodValue[CONFIG.PERIOD_FIELDS.TYPE] == 'between_date') {
                        DatePickerManager.apply(periodValue[CONFIG.PERIOD_FIELDS.BEGIN_DAY]);
                    }
                }
                
                $('[id^=selectable]').selectable();
                
                try {
                    $('#commentaire').val(commentary);
                } catch (error) {
                    Utils.log(error, 'unable to write in #commentaire', 1);
                }
            },

            getSelectedInDashboard() {
                Utils.log('', 'getSelectedInDashboard - START');
                
                var selected = {};
                var errors = 0;
                var errorOutput = 'Impossible de valider le downtime :<br />';
                var dashboardType = $('#dashboardType').html();
                
                Utils.log(dashboardType, 'Dashboard type');
                
                // Configuration email
                var sendingEmail = TokenManager.get("sendingEmail");
                var email = TokenManager.get("email");
                var sendEmail = '';
                
                if (Utils.isNotNull(sendingEmail) && Utils.checkEmail(email)) {
                    var action = dashboardType == 'add' ? 'Ajout' : (dashboardType == 'update' ? 'Modification' : 'Suppression');
                    sendEmail = `| table ID,result | transpose column_name="Champs"
                        | sendemail to="${email}" subject="${action} de downtime" sendresults=true inline=true format=table
                        message="Le downtime ${selected['ID']} vient d'être ${action == 'Ajout' ? 'soumis' : 'mis à jour'}, voici le récapitulatif"`;
                }

                if (dashboardType == "delete") {
                    Utils.log('Mode DELETE détecté', 'getSelectedInDashboard');
                    return DataManager.getDeleteData(selected, sendEmail);
                }

                // Données communes
                selected['sendEmail'] = sendEmail;
                selected['key'] = TokenManager.get('key') || '';
                selected['ID'] = TokenManager.get('DT_ID') || Utils.createID();
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['commentary'] = TextTransformer.removeAccents($('#commentaire').val());
                selected['service'] = TextTransformer.forKV(TokenManager.get('service_selected'));
                selected['kpi'] = TextTransformer.forKV(TokenManager.get('kpi_selected'));
                selected['entity'] = TextTransformer.forKV(TokenManager.get('entity_selected'));
                selected['step_opt'] = DataManager.getStepOpt();
                selected['dt_filter'] = TokenManager.get('dt_filter_selected') || '';
                selected['dt_pattern'] = TokenManager.get('dt_pattern_selected') || '';
                selected['downtimeFields'] = [];
                
                Utils.log(selected, 'Données de base collectées');
                
                // Version
                if (dashboardType == "add") {
                    selected['version'] = TokenManager.get('selected_version') || 1;
                } else if (dashboardType == "update") {
                    selected['version'] = parseInt(TokenManager.get('selected_version') || 50) + 2;
                }

                // Récupération des périodes
                Utils.log('Collecte des périodes', 'getSelectedInDashboard');
                var periodData = DataManager.collectPeriods();
                selected['downtimeFields'] = periodData.downtimeFields;
                errors += periodData.errors;
                errorOutput += periodData.errorOutput;
                
                Utils.log(periodData, 'Données des périodes');

                // Validations finales
                if (Utils.isNull(selected['service'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner un ou plusieurs services<br />';
                }
                if (Utils.isNull(selected['kpi'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner une ou plusieurs kpi<br />';
                }
                if (Utils.isNull(selected['entity'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner une ou plusieurs entités<br />';
                }
                if (Utils.isNull(selected['commentary'])) {
                    errors++;
                    errorOutput += '- Veuillez entrer un commentaire détaillé<br />';
                }

                Utils.log({errors: errors, errorOutput: errorOutput}, 'Résultat validation finale');
                
                return [selected, errors, errorOutput];
            },

            getDeleteData(selected, sendEmail) {
                selected['key'] = TokenManager.get('key') || '';
                selected['ID'] = TokenManager.get('DT_ID') || Utils.createID();
                selected['commentary'] = TextTransformer.removeAccents($('#commentaire').val());
                selected['sendEmail'] = sendEmail;
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['service'] = TextTransformer.forKV(TokenManager.get('service_selected'));
                selected['kpi'] = TextTransformer.forKV(TokenManager.get('kpi_selected'));
                selected['entity'] = TextTransformer.forKV(TokenManager.get('entity_selected'));
                selected['step_opt'] = DataManager.getStepOpt();
                selected['dt_filter'] = TokenManager.get('dt_filter_selected') || '';
                selected['dt_pattern'] = TokenManager.get('dt_pattern_selected') || '';
                selected['downtimeFields'] = TokenManager.get('downtime_selected').split("£");
                selected['version'] = TokenManager.get('selected_version') || 99999;
                
                Utils.log(selected, 'Delete data collectée');
                
                return [selected, 0, ''];
            },

            collectPeriods() {
                Utils.log('Début collectPeriods', 'collectPeriods');
                
                var checkedBegin = [], checkedEnd = [], beginHours = [], endHours = [], type = [];
                var downtimeFields = [];
                var errors = 0;
                var errorOutput = '';
                var atLeastOne = 0;
                var periodCount = 0;

                $('[id^=content-tab-Period]').each(function () {
                    periodCount++;
                    Utils.log('Traitement période ' + periodCount, 'collectPeriods');
                    
                    var dateBegin = '', dateEnd = '', hoursBegin = '', hoursEnd = '';
                    var periodValid = false;

                    if ($(this).find('[periodID=radioD]').is(':checked')) {
                        Utils.log('Type: Date à date', 'collectPeriods');
                        dateBegin = $(this).find('[id^=datepicker_begin]').val();
                        dateEnd = $(this).find('[id^=datepicker_end]').val();
                        Utils.log({dateBegin: dateBegin, dateEnd: dateEnd}, 'Dates collectées');
                        
                        if (dateBegin.length == 10 && dateEnd.length == 10) {
                            atLeastOne = 1;
                            periodValid = true;
                            checkedBegin.push(dateBegin);
                            checkedEnd.push(dateEnd);
                            type.push('between_date');
                        }
                    } else if ($(this).find('[periodID=radioW]').is(':checked')) {
                        Utils.log('Type: Hebdomadaire', 'collectPeriods');
                        dateBegin = [];
                        dateEnd = [];
                        atLeastOne = 1;
                        periodValid = true;
                        $(this).find('.ui-selected').each(function () {
                            dateBegin.push($(this).html());
                            dateEnd.push($(this).html());
                        });
                        checkedBegin.push(dateBegin.join(';'));
                        checkedEnd.push(dateEnd.join(';'));
                        type.push('weekly');
                    } else if ($(this).find('[periodID=radioM]').is(':checked')) {
                        Utils.log('Type: Mensuel', 'collectPeriods');
                        dateBegin = [];
                        dateEnd = [];
                        atLeastOne = 1;
                        periodValid = true;
                        $(this).find('.ui-selected').each(function () {
                            dateBegin.push($(this).html());
                            dateEnd.push($(this).html());
                        });
                        checkedBegin.push(dateBegin.join(';'));
                        checkedEnd.push(dateEnd.join(';'));
                        type.push('monthly');
                    } else if ($(this).find('[periodID=radioS]').is(':checked')) {
                        Utils.log('Type: Spécifique', 'collectPeriods');
                        atLeastOne = 1;
                        periodValid = true;
                        dateBegin = $(this).find('#select_day').val();
                        dateEnd = $(this).find('#select_day').val();
                        checkedBegin.push(dateBegin);
                        checkedEnd.push(dateEnd);
                        var selectedType = $(this).find('#select_type').val();
                        type.push('special_date_' + selectedType + '_in_month');
                    }

                    if (periodValid) {
                        hoursBegin = $(this).find('.inputPeriodBegin').val();
                        hoursEnd = $(this).find('.inputPeriodEnd').val();
                        
                        Utils.log({hoursBegin: hoursBegin, hoursEnd: hoursEnd}, 'Heures collectées');
                        
                        if (!Validator.timeFormat(hoursBegin)) {
                            errors++;
                            errorOutput += '- Format heure de début invalide (HH:MM)<br />';
                        }
                        if (!Validator.timeFormat(hoursEnd)) {
                            errors++;
                            errorOutput += '- Format heure de fin invalide (HH:MM)<br />';
                        }
                        if (hoursBegin == hoursEnd && dateBegin == dateEnd) {
                            errors++;
                            errorOutput += '- Les heures de début et fin ne peuvent être identiques<br />';
                        }
                        if (Validator.endAfterBegin(dateBegin, dateEnd, hoursBegin, hoursEnd)) {
                            errors++;
                            errorOutput += '- L\'heure de début ne peut être supérieure à l\'heure de fin<br />';
                        }
                    } else {
                        // Si aucune période n'est configurée, on met des valeurs par défaut
                        hoursBegin = '00:00';
                        hoursEnd = '00:00';
                    }

                    beginHours.push(hoursBegin);
                    endHours.push(hoursEnd);
                    
                    var downtimeField = DataManager.transformDowntimeField(
                        type[type.length - 1] || 'between_date',
                        TextTransformer.forKV(TextTransformer.daysToEnglish(checkedBegin[checkedBegin.length - 1] || '')),
                        TextTransformer.forKV(TextTransformer.daysToEnglish(checkedEnd[checkedEnd.length - 1] || '')),
                        (beginHours[beginHours.length - 1] || '00:00') + ':00',
                        (endHours[endHours.length - 1] || '00:00') + ':00'
                    );
                    
                    downtimeFields.push(downtimeField);
                    Utils.log(downtimeField, 'Downtime field créé');
                });

                if (errors > 0) {
                    errorOutput += '- Au moins une période ne respecte pas les pré-requis<br />';
                }
                
                Utils.log({downtimeFields: downtimeFields, errors: errors}, 'Résultat collectPeriods');

                return { downtimeFields, errors, errorOutput };
            },

            transformDowntimeField(downtimeType, begin_day, end_day, begin_hour, end_hour) {
                return `${downtimeType}#${begin_day}#${end_day}#${begin_hour}#${end_hour}`;
            },

            getStepOpt() {
                var tokenValue = TokenManager.get("step_opt_for_delete");
                if (Utils.isNotNull(tokenValue)) return tokenValue;
                
                var serviceToken = TokenManager.get('service_type');
                var kpiToken = TokenManager.get('kpi_type');
                var entityToken = TokenManager.get('entity_type');
                var dt_filterToken = TokenManager.get('dt_filter_type');
                if (Utils.isNotNull(serviceToken) && Utils.isNotNull(kpiToken) && Utils.isNotNull(entityToken) && Utils.isNotNull(dt_filterToken)) {
                    return serviceToken.toString() + kpiToken.toString() + entityToken.toString();
                }
                
                return "000";
            }
        };

        // ==================== DASHBOARD ====================
        const Dashboard = {
            createAdd() {
                UIManager.create();
                UIManager.appendPeriodTab('tabs', 'Periode 1');
                DatePickerManager.apply();
                $('[id^=selectable]').selectable();
            },

            createUpdate(downtimeID) {
                Utils.log(downtimeID, 'createUpdate');
                Dashboard.loadDowntimeData(downtimeID, 'update');
            },

            createDelete(downtimeID) {
                Utils.log(downtimeID, 'createDelete');
                Dashboard.loadDowntimeData(downtimeID, 'delete');
            },

            loadDowntimeData(downtimeID, type) {
                var query = QueryBuilder.withDowntimeID(downtimeID);
                var epoch = (new Date).getTime();
                
                var existingDowntimeSearch = new SearchManager({
                    id: 'existingDowntimeSearch' + epoch,
                    preview: false,
                    cache: false,
                    search: mvc.tokenSafe(query),
                });

                existingDowntimeSearch.on('search:done', function (properties) {
                    Utils.log(properties, 'existingDowntimeSearch done');
                    
                    if (properties.content.resultCount > 0) {
                        var myResults = this.data('results', { count: 0 });
                        myResults.on('data', function () {
                            var downtimeData = myResults.data().rows;
                            DataManager.fillDashboard(downtimeData, type);
                        });
                    }
                });

                existingDowntimeSearch.on('search:failed', function(properties) {
                    Utils.log(properties, 'existingDowntimeSearch failed', 2);
                });
            },

            sendData(sendingType) {
                Utils.log(sendingType, '============ sendData - START ============');
                
                try {
                    LoadSpinner.changeMsg('Verification des données en entrée');
                    LoadSpinner.state('ON');
                    
                    // Validation des datepickers
                    Utils.log('Validation des datepickers', 'sendData');
                    var dateValidationErrors = Validator.allDatepickers();
                    Utils.log(dateValidationErrors, 'Erreurs de validation dates');
                    
                    if (dateValidationErrors.length > 0) {
                        Utils.log('Erreurs de validation détectées', 'sendData', 1);
                        LoadSpinner.state('OFF');
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', dateValidationErrors);
                        $('#modal_link')[0].click();
                        return;
                    }
                    
                    Utils.log('Collecte des données du dashboard', 'sendData');
                    var [selected, errors, errorOutput] = DataManager.getSelectedInDashboard();
                    var dashboardType = $('#dashboardType').html();
                    
                    Utils.log(selected, 'Selected data');
                    Utils.log(errors, 'Nombre d\'erreurs');
                    Utils.log(errorOutput, 'Messages d\'erreur');
                    
                    if (errors > 0) {
                        Utils.log('Erreurs de validation des données', 'sendData', 1);
                        LoadSpinner.state('OFF');
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', errorOutput);
                        $('#modal_link')[0].click();
                        return;
                    }
                    
                    // Cacher les boutons
                    $('input#VALID_button').hide();
                    $('input#CANCEL_button').hide();
                    LoadSpinner.changeMsg('Mise à jour 0%');
                    
                    var query = '';
                    try {
                        Utils.log('Création de la query', 'sendData');
                        if (dashboardType == 'add') {
                            Utils.log('Création query ADD', 'Dashboard type');
                            query = QueryBuilder.createAdd(selected);
                        } else if (dashboardType == 'update') {
                            Utils.log('Création query UPDATE', 'Dashboard type');
                            query = QueryBuilder.createUpdate(selected);
                        } else if (dashboardType == 'delete') {
                            Utils.log('Création query DELETE', 'Dashboard type');
                            query = QueryBuilder.createDelete(selected);
                        }
                        
                        Utils.log(query, '========== QUERY FINALE GÉNÉRÉE ==========', 0);
                        
                    } catch (queryError) {
                        Utils.log(queryError, 'ERREUR lors de la création de la query', 2);
                        console.error('Stack trace:', queryError.stack);
                        LoadSpinner.state('OFF');
                        $('input#VALID_button').show();
                        $('input#CANCEL_button').show();
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', 'Erreur lors de la génération de la requête: ' + queryError.message);
                        $('#modal_link')[0].click();
                        return;
                    }
                    
                    if (sendingType == 'valid') {
                        Utils.log('Lancement de la recherche Splunk', 'SendingType valid');
                        
                        var omni_kv = new SearchManager({
                            id: 'omni_kv' + selected['ID'],
                            preview: false,
                            cache: false,
                            search: mvc.tokenSafe(query),
                        });
                        
                        omni_kv.on('search:done', function (properties) {
                            Utils.log(properties, 'omni_kv search done');
                            
                            var closingLink = dashboardType == 'add' 
                                ? '<a href="/app/' + app_path + '/' + viewName + '">Fermer la fenêtre</a>'
                                : '<a href="/app/' + app_path + '/accueil">Fermer la fenêtre</a>';
                            
                            Dashboard.showSuccessMessage('Information', 'Mise à jour de la base des downtimes OK', closingLink);
                        });
                        
                        omni_kv.on('search:failed', function(properties) {
                            Utils.log(properties, 'omni_kv search FAILED', 2);
                            LoadSpinner.state('OFF');
                            $('input#VALID_button').show();
                            $('input#CANCEL_button').show();
                            TokenManager.set('modal_header', 'ERREUR');
                            TokenManager.set('modal_content', 'La recherche Splunk a échoué. Vérifiez les logs.');
                            $('#modal_link')[0].click();
                        });
                        
                        omni_kv.on('search:error', function(properties) {
                            Utils.log(properties, 'omni_kv search ERROR', 2);
                            LoadSpinner.state('OFF');
                            $('input#VALID_button').show();
                            $('input#CANCEL_button').show();
                        });
                    } else {
                        Utils.log('Mode test - query générée mais non exécutée', 'sendData');
                        LoadSpinner.state('OFF');
                        $('input#VALID_button').show();
                        $('input#CANCEL_button').show();
                    }
                    
                } catch (error) {
                    Utils.log(error, 'ERREUR CRITIQUE dans sendData', 2);
                    console.error('Erreur complète:', error);
                    console.error('Stack trace:', error.stack);
                    LoadSpinner.state('OFF');
                    $('input#VALID_button').show();
                    $('input#CANCEL_button').show();
                    TokenManager.set('modal_header', 'ERREUR CRITIQUE');
                    TokenManager.set('modal_content', 'Une erreur inattendue s\'est produite: ' + error.message);
                    $('#modal_link')[0].click();
                }
            },

            showSuccessMessage(header, content, footer) {
                Utils.log([header, content, footer], 'showSuccessMessage');
                
                LoadSpinner.changeMsg('Mise à jour 50%');
                Utils.applySleep(1000);
                LoadSpinner.changeMsg('Mise à jour 100%');
                
                $('#modal_popup').modal({
                    escapeClose: false,
                    clickClose: false,
                    showClose: false,
                });
                
                TokenManager.set('modal_header', header);
                TokenManager.set('modal_content', content);
                TokenManager.set('modal_footer', footer);
                $('#modal_link')[0].click();
                LoadSpinner.state('OFF');
            }
        };

        // ==================== GESTION DES TOOLTIPS ====================
        var originalTooltip = $.fn.tooltip;
        $.fn.tooltip = function(options) {
            try {
                if (options === 'destroy' && !this.data('ui-tooltip')) {
                    return this;
                }
                return originalTooltip.apply(this, arguments);
            } catch (e) {
                Utils.log(e, 'Tooltip error', 1);
                return this;
            }
        };

        // ==================== INITIALISATION ====================
        $(document).ready(function () {
            Utils.log('Document ready', 'Initialisation');
            
            UIManager.create();
            var downtimeID = TokenManager.get('DT_ID');
            var dashboardType = $('#dashboardType').html();
            
            Utils.log({downtimeID: downtimeID, dashboardType: dashboardType}, 'Paramètres initialisation');
            
            if (dashboardType == 'add') {
                Utils.log('Mode ADD', 'Initialisation');
                Dashboard.createAdd();
            } else if (dashboardType == 'update') {
                Utils.log('Mode UPDATE', 'Initialisation');
                if (Utils.isNotNull(downtimeID)) {
                    Dashboard.createUpdate(downtimeID);
                }
            } else if (dashboardType == 'delete') {
                Utils.log('Mode DELETE', 'Initialisation');
                if (Utils.isNotNull(downtimeID)) {
                    Dashboard.createDelete(downtimeID);
                }
            }
        });

        // ==================== ÉVÉNEMENTS ====================
        $(document).on('click', '#tAdd', function () {
            Utils.log('Click sur tAdd', 'Événements');
            UIManager.appendPeriodTab('tabs', 'Periode ' + numberTabs);
            $('[id^=selectable]').selectable();
            DatePickerManager.apply();
        });

        $(document).on('click', '.btnx', function () {
            Utils.log('Click sur btnx', 'Événements');
            var cur = $(this).attr('id').replace('btnx', 'tab');
            var $tab = $('#' + cur);
            var $content = $('#content-' + cur);
            
            // Nettoyer les tooltips
            $tab.find('[data-ui-tooltip]').each(function() {
                if ($(this).data('ui-tooltip')) {
                    $(this).tooltip('destroy');
                }
            });
            $content.find('[data-ui-tooltip]').each(function() {
                if ($(this).data('ui-tooltip')) {
                    $(this).tooltip('destroy');
                }
            });
            
            $tab.remove();
            $content.remove();
            numberTabs -= 1;
        });

        $(document).on('click', '.tab', function () {
            Utils.log('Click sur tab', 'Événements');
            $('.tab-content').removeClass('current');
            var cur = 'content-' + $(this).attr('id');
            $('#' + cur).addClass('current');
        });

        $(document).on('click', 'input#VALID_button', function () {
            Utils.log('========== CLICK SUR VALIDER ==========', 'Événements', 0);
            Dashboard.sendData('valid');
        });

        $(document).on('click', 'input#TEST_button', function () {
            Utils.log('========== CLICK SUR TEST ==========', 'Événements', 0);
            Dashboard.sendData('test');
        });

        $(document).on('click', 'input#CANCEL_button', function () {
            Utils.log('Click sur Cancel', 'Événements');
            window.location.href = '/app/' + app_path + '/' + viewName;
        });

        $('body').on('change', '.radiobasis', function () {
            Utils.log('Change radiobasis', 'Événements');
            var cur = $(this).attr('id').replace('form-', '');
            var selected_value = $('input[name="basis-' + cur + '"]:checked').val();
            Utils.log({cur: cur, selected_value: selected_value}, 'Radiobasis change');
            $('#table-' + cur).html(UIManager.createPeriodContent(cur, selected_value));
            $('[id^=selectable]').selectable();
            DatePickerManager.apply();
        });

    }); // Fin du require principal
}); // Fin du require initial
