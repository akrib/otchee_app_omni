var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '3.1.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance Views App v' + APP_VERSION + ' charge');

require([
  'underscore',
  'jquery',
  'splunkjs/mvc',
  'splunkjs/mvc/searchmanager',
  'splunkjs/mvc/utils',
  'splunkjs/mvc/simplexml/ready!'
], function (_, $, mvc, SearchManager, utils) {

  'use strict';

  /* ============================================================
   *  DETECTION DU MODE
   * ============================================================ */
  var MOUNTS = {
    search: { mount: 'omni_maintenance_search_app', config: 'omni_search_config', smPrefix: 'omnis' },
    mine:   { mount: 'omni_maintenance_mine_app',   config: 'omni_mine_config',   smPrefix: 'omnim' },
    logs:   { mount: 'omni_maintenance_logs_app',   config: 'omni_logs_config',   smPrefix: 'omnil' }
  };

  var MODE = (function () {
    if ($('#omni_search_config').length) return 'search';
    if ($('#omni_mine_config').length) return 'mine';
    if ($('#omni_logs_config').length) return 'logs';
    return 'search';
  })();

  var MNT = MOUNTS[MODE];
  var IS_LOGS = (MODE === 'logs');
  var IS_MINE = (MODE === 'mine');
  var IS_SEARCH = (MODE === 'search');

  /* ============================================================
   *  CONFIG
   * ============================================================ */
  var Config = (function () {
    function urlParam(name) {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
      return m ? decodeURIComponent(m[1]) : null;
    }
    var $cfg = $('#' + MNT.config);
    return {
      mode: MODE,
      debug: (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1',
      clientScope: (urlParam('client_scope') || $cfg.attr('data-client-scope') || '0') === '1',
      rowsPerPage: parseInt(urlParam('rows') || $cfg.attr('data-rows') || '30', 10),
      // ID pre-selectionne (lien depuis la recherche : ?form.input_ID=...) -> logs
      preID: urlParam('form.input_ID') || urlParam('input_ID') || '',
      appPath: APP_NAME,
      view: utils.getPageInfo().page,
      mountId: MNT.mount
    };
  })();

  /* ============================================================
   *  LOG
   * ============================================================ */
  function log(obj, titre, level) {
    if (!Config.debug) return;
    var colors = ['#fff', '#ff0', '#f00'];
    console.groupCollapsed('%c Omni %s', 'color:' + (colors[level || 0]), titre || '');
    try { console.log(obj); } catch (e) {}
    console.groupEnd();
  }

  /* ============================================================
   *  UTIL  (union des helpers des 3 applis)
   * ============================================================ */
  var Util = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    escRe: function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
    // surligne les termes (sur du texte DEJA echappe ; terms = tableau lowercase)
    hl: function (escaped, terms) {
      if (!terms || !terms.length) return escaped;
      var re = new RegExp('(' + terms.map(Util.escRe).join('|') + ')', 'ig');
      return escaped.replace(re, '<mark class="omni-mark">$1</mark>');
    },
    enc: function (s) { return encodeURIComponent(s == null ? '' : s); },
    // pour injecter une valeur dans une chaine SPL entre guillemets
    splQuote: function (s) { return String(s == null ? '' : s).replace(/"/g, '\\"'); },
    // interpretation tolerante d'un status -> true (actif/enabled) / false
    statusOn: function (v) {
      var s = String(v == null ? '' : v).toLowerCase().trim();
      return (s === 'enable' || s === 'enabled' || s === '1'
        || s === 'true' || s === 'on' || s === 'active' || s === 'actif');
    },
    // transforme la saisie en matchers (supporte * et ?). "*" seul = tout.
    parseQuery: function (str) {
      var raw = String(str || '').toLowerCase().split(/\s+/).filter(Boolean);
      var matchers = [], hlTerms = [];
      raw.forEach(function (t) {
        if (t === '*' || t === '%') return;                 // wildcard "tout" -> aucun filtre
        if (t.indexOf('*') !== -1 || t.indexOf('?') !== -1) { // wildcard partiel -> regex
          var pat = Util.escRe(t).replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
          var re = new RegExp(pat);
          matchers.push(function (blob) { return re.test(blob); });
          t.split(/[*?]+/).forEach(function (c) { if (c) hlTerms.push(c); });
        } else {                                            // terme simple -> sous-chaine
          matchers.push(function (blob) { return blob.indexOf(t) !== -1; });
          hlTerms.push(t);
        }
      });
      return { matchers: matchers, hlTerms: hlTerms };
    },
    epochFromInput: function (val) {
      if (!val) return Math.floor(Date.now() / 1000);
      var t = new Date(val).getTime();
      return isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000);
    },
    nowInputValue: function () {
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
  };

  // recurrences -> libelle FR
  var DT_TYPE_FR = {
    weekly: 'Hebdomadaire',
    monthly: 'Mensuel',
    between_date: 'Date a date',
    special_date_first_in_month: 'Premier du mois',
    special_date_second_in_month: 'Deuxieme du mois',
    special_date_third_in_month: 'Troisieme du mois',
    special_date_fourth_in_month: 'Quatrieme du mois',
    special_date_last_in_month: 'Dernier du mois',
    Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
    Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche'
  };

  // actions -> libelle FR (mode logs)
  var ACTION_FR = {
    add: 'Ajout', update: 'Modification', delete: 'Suppression', obsolete: 'Obsolete'
  };

  /* ============================================================
   *  SEARCH HUB  -  loader global a pourcentage (identique aux 3)
   * ============================================================ */
  var SearchHub = {
    _active: {},

    run: function (id, spl, opts) {
      opts = opts || {};
      var sm = new SearchManager(_.extend({
        id: MNT.smPrefix + '_' + id + '_' + Date.now(),
        preview: false,
        cache: false,
        autostart: true,
        search: opts.tokenSafe ? mvc.tokenSafe(spl) : spl,
        earliest_time: opts.earliest || '-24h@h',
        latest_time: opts.latest || 'now'
      }, opts.searchOpts || {}));

      // --- DEBUG : trace + memorisation de la requete envoyee ---
      Store.lastQueries[id] = spl;
      if (Config.debug) {
        log({ id: id, options: opts }, 'SearchHub.run > ' + id);
        try { console.log('%c SPL [' + id + ']', 'color:#0bf;font-weight:bold', '\n' + spl); } catch (e) {}
      }

      var sid = sm.id;
      SearchHub._active[sid] = 0.01;
      SearchHub._render(opts.message);

      sm.on('search:progress', function (p) {
        var dp = (p && p.content && typeof p.content.doneProgress === 'number')
          ? p.content.doneProgress : 0;
        SearchHub._active[sid] = Math.max(0.01, dp);
        SearchHub._render(opts.message);
      });

      sm.on('search:done', function (p) {
        SearchHub._active[sid] = 1;
        SearchHub._render(opts.message);
        var rc = (p && p.content) ? p.content.resultCount : -1;
        if (Config.debug) log('resultCount = ' + rc, 'SearchHub done > ' + id);

        if (opts.onResults && rc >= 0) {
          // json_rows -> { fields:[...], rows:[[...]] } (fiable selon les versions)
          var rs = sm.data('results', { count: opts.count || 0, output_mode: 'json_rows' });
          rs.on('data', function () {
            var d = rs.data() || {};
            var fields = (d.fields || []).map(function (f) { return (typeof f === 'string') ? f : (f && f.name) || f; });
            var rows = d.rows;
            // filet de securite si une version renvoie .results (tableau d'objets)
            if ((!rows || !rows.length) && d.results && d.results.length) {
              var fn = fields.length ? fields : COLS;
              rows = d.results.map(function (o) { return fn.map(function (n) { return o[n]; }); });
            }
            rows = rows || [];
            if (Config.debug) log({ lignes: rows.length, fields: fields, exemple: rows[0] }, 'resultats lus > ' + id);
            opts.onResults(rows, fields);
          });
          rs.on('error', function () { if (opts.onError) opts.onError(); });
        }
        if (opts.onDone) opts.onDone(p);
        delete SearchHub._active[sid];
        SearchHub._render(opts.message);
      });

      sm.on('search:failed search:error', function (p) {
        log(p, 'recherche en echec : ' + id, 2);
        delete SearchHub._active[sid];
        SearchHub._render(opts.message);
        if (opts.onError) opts.onError(p);
      });

      return sm;
    },

    _overall: function () {
      var keys = Object.keys(SearchHub._active);
      if (!keys.length) return 1;
      var sum = keys.reduce(function (a, k) { return a + SearchHub._active[k]; }, 0);
      return sum / keys.length;
    },

    _render: function (message) {
      var anyActive = Object.keys(SearchHub._active).length > 0;
      var $ld = $('#omni-loader');
      if (!$ld.length) return;
      if (!anyActive) { $ld.removeClass('is-visible'); return; }
      var pct = Math.round(SearchHub._overall() * 100);
      $ld.addClass('is-visible');
      $ld.find('.omni-loader__bar').css('width', Math.max(pct, 5) + '%');
      $ld.find('.omni-loader__pct').text(pct + '%');
      $ld.find('.omni-loader__msg-txt').text(message || 'Chargement des donnees…');
    }
  };

  /* ============================================================
   *  REQUETES SPL  (tous modes)
   *  NB : le champ "status" (status GLOBAL de la maintenance, hors json)
   *  est desormais remonte dans le | table de chaque requete. Le status
   *  PAR periode reste porte par chaque objet du json downtime (p.status).
   * ============================================================ */
  var SPL = {
    // ---- search : RBAC (filtre client en fonction des roles) ----
    clientFilter: ''
      + '| rest /services/authentication/users splunk_server=local '
      + '| search [ | rest /services/authentication/current-context splunk_server=local '
      + '            | rename username as title | fields title ] '
      + '| fields title roles realname | rename title as userName | rename realname as Name '
      + '| stats values(Name) as Name by userName, roles '
      + '| search NOT roles IN ("client_all_*","user","all_itop_user","*_cds_client","can_*","splk_*","all_omni_user") '
      + '| eval filtre2=case(roles like "%all_cds_adm%","client=*",roles like "%dms_itoa_%","client=*",roles like "%rab_%","client=*",roles like "%admin%","client=*") '
      + '| rex field=roles "client_(?<client_name>[^\\_]+)_*" '
      + '| eval filtre="client="+client_name | eval filtre=if(isnull(filtre),filtre2,filtre) '
      + '| stats values(filtre) as filtre by userName,Name | mvexpand filtre | table filtre',

    // ---- search : donnees structurees. clientWhere : "| search (client=...)" ou "" ----
    searchMain: function (epoch, clientWhere) {
      return ''
        + '| inputlookup omni_kv_def ' + (clientWhere ? clientWhere + ' ' : '')
        + '| eval orig_time=' + epoch + ' '
        + '| eval downtime_json = "[" + mvjoin(downtime, ",") + "]" '
        + '| spath input=downtime_json '
        + '| rename {}.id as dt_ids, {}.dt_type as dt_type, {}.begin_date as begin_date, '
        + '         {}.end_date as end_date, {}.begin_time as begin_time, {}.end_time as end_time '
        + '| eval nbperiode=mvcount(dt_ids), omni_skip_filter=1 '
        + '| omnidowntimecalculation epoctime="orig_time" dtfield="downtime" outputfield="flag_dt" skip_filter=omni_skip_filter '
        + '| eval entity=mvjoin(entity, ";"), kpi=mvjoin(kpi,";"), service=mvjoin(service, ";"), '
        + '       dt_policy=coalesce(dt_policy,"-"), status=coalesce(status,"") '
        + '| eval last_update=strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S") '
        + '| eval category=if(step_opt=="000","CUSTOM","ITSI") '
        + '| eval search_blob=lower(coalesce(ID,"")." ".coalesce(creator,"")." ".coalesce(entity,"")." "'
        + '       .coalesce(kpi,"")." ".coalesce(service,"")." ".coalesce(dt_filter,"")." ".coalesce(dt_policy,"")." "'
        + '       .coalesce(commentary,"")." ".coalesce(client,"")." ".coalesce(site,"")." ".coalesce(target,"")." "'
        + '       .coalesce(orig_host,"")." ".coalesce(servicename,"")) '
        + '| table ID, creator, last_update, flag_dt, status, version, step_opt, category, entity, kpi, service, '
        + '        dt_filter, dt_policy, commentary, downtime_json, nbperiode, search_blob';
    },

    // ---- mine : utilisateur courant ----
    me: ''
      + '| rest /services/authentication/current-context splunk_server=local '
      + '| rename username as user | table user',

    // ---- mine : identique a search, mais filtre creator = utilisateur courant ----
    mineMain: function (epoch, user) {
      return ''
        + '| inputlookup omni_kv_def '
        + '| search creator="' + Util.splQuote(user) + '" '
        + '| eval orig_time=' + epoch + ' '
        + '| eval downtime_json = "[" + mvjoin(downtime, ",") + "]" '
        + '| spath input=downtime_json '
        + '| rename {}.id as dt_ids, {}.dt_type as dt_type, {}.begin_date as begin_date, '
        + '         {}.end_date as end_date, {}.begin_time as begin_time, {}.end_time as end_time '
        + '| eval nbperiode=mvcount(dt_ids), omni_skip_filter=1 '
        + '| omnidowntimecalculation epoctime="orig_time" dtfield="downtime" outputfield="flag_dt" skip_filter=omni_skip_filter '
        + '| eval entity=mvjoin(entity, ";"), kpi=mvjoin(kpi,";"), service=mvjoin(service, ";"), '
        + '       dt_policy=coalesce(dt_policy,"-"), status=coalesce(status,"") '
        + '| eval last_update=strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S") '
        + '| eval category=if(step_opt=="000","CUSTOM","ITSI") '
        + '| eval search_blob=lower(coalesce(ID,"")." ".coalesce(creator,"")." ".coalesce(entity,"")." "'
        + '       .coalesce(kpi,"")." ".coalesce(service,"")." ".coalesce(dt_filter,"")." ".coalesce(dt_policy,"")." "'
        + '       .coalesce(commentary,"")." ".coalesce(client,"")." ".coalesce(site,"")." ".coalesce(target,"")." "'
        + '       .coalesce(orig_host,"")." ".coalesce(servicename,"")) '
        + '| table ID, creator, last_update, flag_dt, status, version, step_opt, category, entity, kpi, service, '
        + '        dt_filter, dt_policy, commentary, downtime_json, nbperiode, search_blob';
    },

    // ---- logs : historique structure (JSON propre) ----
    logs: function () {
      return ''
        + '| inputlookup omni_kv_trace_log_def '
        + '| search NOT action="obsolete" '
        // reconstruction du vrai tableau JSON :
        + '| eval downtime_json = "[" + mvjoin(downtime, ",") + "]" '
        + '| eval nbperiode = mvcount(downtime) '
        + '| eval entity=mvjoin(entity, ";"), kpi=mvjoin(kpi,";"), service=mvjoin(service, ";"), '
        + '       dt_policy=coalesce(dt_policy,"-"), status=coalesce(status,"") '
        + '| eval last_update=strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S") '
        + '| eval category=if(coalesce(step_opt,"")=="000","CUSTOM","ITSI") '
        + '| eval search_blob=lower(coalesce(ID,"")." ".coalesce(creator,"")." ".coalesce(entity,"")." "'
        + '       .coalesce(kpi,"")." ".coalesce(service,"")." ".coalesce(dt_filter,"")." ".coalesce(dt_policy,"")." "'
        + '       .coalesce(commentary,"")." ".coalesce(action,"")) '
        + '| sort 0 - dt_update '
        + '| table ID, creator, last_update, dt_update, action, status, version, category, entity, kpi, service, '
        + '        dt_filter, dt_policy, commentary, downtime_json, nbperiode, search_blob';
    }
  };

  // ordre des colonnes du | table -> mapping ligne -> objet (depend du mode)
  // IMPORTANT : doit rester strictement aligne sur le | table correspondant.
  var COLS = IS_LOGS
    ? ['ID', 'creator', 'last_update', 'dt_update', 'action', 'status', 'version', 'category',
       'entity', 'kpi', 'service', 'dt_filter', 'dt_policy', 'commentary',
       'downtime_json', 'nbperiode', 'search_blob']
    : ['ID', 'creator', 'last_update', 'flag_dt', 'status', 'version', 'step_opt', 'category',
       'entity', 'kpi', 'service', 'dt_filter', 'dt_policy', 'commentary',
       'downtime_json', 'nbperiode', 'search_blob'];

  function rowToObj(r) {
    var o = {};
    for (var i = 0; i < COLS.length; i++) o[COLS[i]] = r[i];
    return o;
  }

  // identifiant SearchHub de la requete principale (pour le panneau debug)
  var MAIN_ID = IS_LOGS ? 'logs' : 'main';

  /* ============================================================
   *  STORE  -  etat (union des 3)
   * ============================================================ */
  var Store = {
    all: [], filtered: [],
    page: 0, term: '', category: 'all',
    activeOnly: false,                 // search / mine
    action: 'all',                     // logs
    statusFilter: 'all',               // tous : all | enabled | disabled
    sort: IS_LOGS ? 'date' : 'update',
    epoch: Util.epochFromInput(null),  // search / mine
    loadTime: 0,
    clientWhere: '',                   // search (RBAC)
    user: '', userResolved: false,     // mine
    hlTerms: [],
    latestById: {},                    // logs : {ID -> {maxVersion, action}}
    lastQueries: {}
  };

  /* ============================================================
   *  UI  -  shell + composants
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-views-style').length) return;
      var M = '#' + Config.mountId;
      var c = [
        ':root{--omni-primary:#23579d;--omni-primary-2:#1d3f73;--omni-accent:#fcb040;--omni-ok:#00cec9;--omni-err:#ff7675;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        M + '{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:1180px;margin:0 auto;}',
        M + ' *{box-sizing:border-box;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:20px;margin:0;font-weight:600;letter-spacing:.3px;color:#fff;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        /* toolbar */
        '.omni-toolbar{padding:18px 24px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;border-bottom:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-tb-field{display:flex;flex-direction:column;gap:6px;}',
        '.omni-tb-field label{font-size:12px;font-weight:600;color:var(--omni-muted);}',
        '.omni-search-wrap{position:relative;flex:1;min-width:90%;}',
        '#omni-date{margin:0}',
        '.omni-search-wrap input{width:100%;border:1px solid var(--omni-line);border-radius:10px;padding:11px 38px 11px 38px;font-size:14px;font-family:inherit;}',
        '.omni-search-wrap input:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(35,87,157,.12);}',
        '.omni-search-wrap .omni-ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--omni-muted);font-size:15px;}',
        '.omni-search-wrap .omni-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--omni-muted);cursor:pointer;font-size:18px;line-height:1;display:none;}',
        '.omni-input,.omni-select{border:1px solid var(--omni-line);border-radius:10px;padding:10px 12px;font-size:14px;height:42px;font-family:inherit;background:#fff;margin: 0;}',
        '.omni-input:focus,.omni-select:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(35,87,157,.12);}',
        '.omni-chips{display:flex;gap:6px;flex-wrap:wrap;}',
        '.omni-chip{border:1px solid var(--omni-line);border-radius:999px;padding:8px 14px;cursor:pointer;font-size:13px;background:#fff;transition:.15s;}',
        '.omni-chip.is-active{border-color:var(--omni-primary);background:rgba(35,87,157,.08);color:var(--omni-primary);font-weight:600;}',
        '.omni-toggle{display:inline-flex;font-size:14px;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--omni-ink);cursor:pointer;user-select:none;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--ghost:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;display:none;align-items:center;gap:6px;}',
        '.omni-btn--primary:hover{background:var(--omni-primary-2);}',
        '.omni-dbg{background:#0f2238;color:#cfe6ff;border-radius:8px;padding:12px 14px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:38vh;}',
        '.omni-dbg-h{font-weight:600;color:var(--omni-primary);margin:14px 0 6px;font-size:13px;}',
        '.omni-iconbtn{width:40px;height:40px;border-radius:10px;border:1px solid var(--omni-line);background:#fff;cursor:pointer;font-size:16px;color:var(--omni-muted);}',
        '.omni-iconbtn:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        /* meta */
        '.omni-meta{display:flex;flex-wrap:wrap;align-items:center;gap:18px;padding:14px 24px 4px;}',
        '.omni-count{font-size:16px;color:#34495e;font-weight:600;}',
        '.omni-count small{font-weight:400;color:var(--omni-muted);}',
        '.omni-legend{display:flex;gap:18px;font-size:12.5px;color:var(--omni-muted);margin-left:auto;align-items:center;flex-wrap:wrap;}',
        /* resultats */
        '.omni-results{padding:8px 24px 8px;}',
        '.omni-empty{text-align:center;color:var(--omni-muted);padding:48px 12px;font-size:15px;}',
        '.row-search{box-shadow:0 5px 15px rgba(0,0,0,.10),0 6px 6px rgba(0,0,0,.08);border-radius:12px;background:#fff;margin:16px 0;overflow:hidden;display:flex;}',
        '.col-search{flex:1;padding:16px 18px;min-width:0;background:#f7f9fc}',
        '.search-option{width:120px;background:#ffffff;border-left:1px solid var(--omni-line);padding:14px 8px;text-align:center;}',
        '.title-search{font-size:15px;font-weight:600;color:var(--omni-primary);display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px;}',
        '.title-search.last-col{justify-content:center;color:var(--omni-muted);font-size:12px;letter-spacing:.5px;margin-bottom:10px;}',
        '.tag-search-li{font-size:11.5px;color:var(--omni-muted);font-weight:400;margin-left:8px;}',
        '.tag-search-li .search-bold{color:var(--omni-ink);}',
        '.fieldlist{font-size:12.5px;color:var(--omni-muted);font-weight:600;margin-right:4px;}',
        '.tag{font-family:Roboto,sans-serif;font-size:12px;background:var(--omni-primary);border-radius:4px;color:#fff;display:inline-block;margin:3px 3px 3px 0!important;padding:3px 8px!important;}',
        '.tag_dt{font-family:Roboto,sans-serif;font-size:12px;background:#74b9ff;border-radius:4px;color:#fff;display:inline-block;margin:3px!important;padding:3px 8px!important;}',
        '.tag_comment{font-family:Roboto,sans-serif;font-size:12.5px;display:inline-block;padding:3px 4px!important;color:#222;}',
        '.comment-block{background:#d1d1d1;background-color:#d1d1d1;color:#000!important;border-left:3px solid var(--omni-accent);padding-left:10px;margin:8px 0 0;}',
        '.omni-mark{background:#ffe9a8;color:inherit;border-radius:3px;padding:0 1px;}',
        '.img-option{transition:.15s;}.img-option:hover{transform:scale(1.08);}',
        '.search-option a{display:inline-block;margin-bottom:6px;}',
        /* badges type */
        '.dt-type-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}',
        '.dt-type-itsi{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);box-shadow:0 2px 4px rgba(102,126,234,.3);}',
        '.dt-type-custom{background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);box-shadow:0 2px 4px rgba(245,87,108,.3);}',
        /* badge status GLOBAL (hors json) sur la carte */
        '.dt-gstatus{display:inline-flex;align-items:center;gap:6px;font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;text-transform:uppercase;letter-spacing:.4px;}',
        '.dt-gstatus::before{content:"";width:8px;height:8px;border-radius:50%;display:inline-block;}',
        '.dt-gstatus--on{background:rgba(0,206,201,.12);color:#0a8f8b;border:1px solid rgba(0,206,201,.45);}',
        '.dt-gstatus--on::before{background:var(--omni-ok);}',
        '.dt-gstatus--off{background:rgba(255,118,117,.12);color:#c0392b;border:1px solid rgba(255,118,117,.45);}',
        '.dt-gstatus--off::before{background:var(--omni-err);}',
        /* accordion */
        '.accordion{position:relative;width:100%;margin-top:10px;border-radius:8px;overflow:hidden;box-shadow:0 1px 8px rgba(0,0,0,.18);}',
        '.accordion label{position:relative;display:block;padding:.55em .7em;background:#fff;margin:0;font-size:.95em;color:#666;cursor:pointer;transition:all .4s cubic-bezier(.865,.14,.095,.87);}',
        '.accordion label:after{content:"+";position:absolute;right:.7em;top:50%;transform:translateY(-50%);width:1em;height:1em;line-height:1em;font-weight:bold;color:#f25c78;font-size:1.6em;text-align:center;border-radius:50%;}',
        '.accordion input[name="panel"]{display:none;}',
        '.accordion input:checked+label{color:#fff;background:#444;}',
        '.accordion input:checked+label:after{content:"-";color:#fff;}',
        '.accordion__content{overflow:hidden;height:0;padding:0 18px;background:linear-gradient(to bottom,#444 0%,#222 100%);color:#eee;box-shadow:inset 4px 0 0 0 #f25c78;transition:height .4s cubic-bezier(.865,.14,.095,.87);}',
        '.accordion input:checked~.accordion__content--small{height:auto;padding:12px 18px;}',
        '.accordion__body{font-size:.85em;line-height:1.5em;}',
        '.dt_period td{padding:2px 4px;}',
        '.dt-status{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;vertical-align:middle;margin-left:8px;}',
        '.dt-status::before{content:"";display:block;}',
        '.dt-status--on{background:rgba(0,206,201,.12);border:1px solid rgba(0,206,201,.45);}',
        '.dt-status--on::before{width:8px;height:14px;margin-top:-3px;border:solid var(--omni-ok);border-width:0 3px 3px 0;transform:rotate(45deg);}',
        '.dt-status--off{background:rgba(255,118,117,.10);border:1px solid rgba(255,118,117,.45);}',
        '.dt-status--off::before{width:14px;height:3px;border-radius:2px;background:var(--omni-err);}',
        /* pagination */
        '.omni-pagination{display:flex;justify-content:center;align-items:center;gap:6px;padding:8px 0 26px;flex-wrap:wrap;}',
        '.omni-pagination a{color:#fff;background:var(--omni-primary);border-radius:50%;min-width:30px;height:30px;line-height:30px;text-align:center;text-decoration:none;font-size:13px;padding:0 8px;}',
        '.omni-pagination a.active{background:#b4d6ff;color:var(--omni-primary-2);font-weight:700;}',
        '.omni-pagination a:hover:not(.active){background:var(--omni-primary-2);}',
        '.omni-pagination .nav{border-radius:8px;}',
        '.omni-pagination .gap{color:var(--omni-muted);padding:0 4px;}',
        /* loader */
        '.omni-loader{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#0f2238;color:#fff;border-radius:12px;padding:14px 22px;min-width:280px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:.2s;z-index:9999;}',
        '.omni-loader.is-visible{opacity:1;}',
        '.omni-loader__msg{font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;}',
        '.omni-loader__track{height:8px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;}',
        '.omni-loader__bar{height:100%;width:5%;background:linear-gradient(90deg,var(--omni-accent),#ffd27a);border-radius:999px;transition:width .25s;}',
        /* modal */
        '.omni-modal{position:fixed;inset:0;background:rgba(15,34,56,.55);display:none;align-items:center;justify-content:center;z-index:10000;}',
        '.omni-modal.is-open{display:flex;}',
        '.omni-modal__box{background:#fff;border-radius:14px;width:min(620px,92vw);max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);}',
        '.omni-modal__head{padding:16px 22px;background:var(--omni-primary);color:#fff;font-weight:600;}',
        '.omni-modal__head.is-err{background:var(--omni-err);}.omni-modal__head.is-ok{background:var(--omni-ok);}',
        '.omni-modal__body{padding:20px 22px;font-size:14px;line-height:1.55;}',
        '.omni-modal__body h3{margin:14px 0 6px;font-size:15px;color:var(--omni-primary);}',
        '.omni-modal__body ul{margin:6px 0 12px 18px;}',
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}'
      ];

      // --- CSS specifique au mode ---
      if (IS_LOGS) {
        // legende carree (actions) + badges d'action
        c.push('.omni-legend{gap:14px;}');
        c.push('.omni-legend .dot{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:middle;}');
        c.push('.omni-legend .dot.add{background:#00b894;}.omni-legend .dot.update{background:#0984e3;}');
        c.push('.omni-legend .dot.delete{background:#d63031;}.omni-legend .dot.obsolete{background:#636e72;}');
        c.push('.dt-action-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}');
        c.push('.dt-action-add{background:linear-gradient(135deg,#00b894,#00cec9);box-shadow:0 2px 4px rgba(0,184,148,.3);}');
        c.push('.dt-action-update{background:linear-gradient(135deg,#0984e3,#74b9ff);box-shadow:0 2px 4px rgba(9,132,227,.3);}');
        c.push('.dt-action-delete{background:linear-gradient(135deg,#d63031,#ff7675);box-shadow:0 2px 4px rgba(214,48,49,.3);}');
        c.push('.dt-action-obsolete{background:linear-gradient(135deg,#636e72,#b2bec3);box-shadow:0 2px 4px rgba(99,110,114,.3);}');
      } else {
        // legende ronde (actif/inactif) + LED animee
        c.push('.omni-legend .dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:5px;vertical-align:middle;}');
        c.push('.omni-legend .dot.up{background:var(--omni-ok);}.omni-legend .dot.down{background:var(--omni-err);}');
        c.push('.led{display:inline-block;width:10px;height:10px;border-radius:50%;position:relative;vertical-align:middle;}');
        c.push('.led[type="up"]{background:var(--omni-ok);}.led[type="down"]{background:var(--omni-err);}');
        c.push('.led[type="up"]::before,.led[type="up"]::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--omni-ok);animation:omnibounce 1.5s infinite;}');
        c.push('.led[type="up"]::after{animation-delay:-.4s;}');
        c.push('@keyframes omnibounce{0%{transform:scale(1);opacity:1;}100%{transform:scale(2.4);opacity:0;}}');
      }

      $('<style id="omni-views-style">').text(c.join('\n')).appendTo('head');
    },

    shell: function () {
      var titleByMode = { search: 'Maintenance Search', mine: 'Mes Maintenances', logs: 'Maintenance Logs' };
      var badgeHtml = IS_MINE
        ? '<span class="omni-badge" id="omni-user-badge">perso</span>'
        : '<span class="omni-badge">' + (IS_LOGS ? 'journal' : 'search') + '</span>';

      var placeholderByMode = {
        search: 'Hote, site, sonde, auteur, commentaire, ticket… (plusieurs mots = ET)',
        mine: 'Hote, site, sonde, service, kpi, commentaire, ticket… (plusieurs mots = ET)',
        logs: 'ID, auteur, service, kpi, entity, commentaire, action…'
      };

      var sortByMode = {
        search: '<option value="update">Derniere MAJ</option>'
              + '<option value="active">En cours de maintenance d\'abord</option>'
              + '<option value="id">ID</option>'
              + '<option value="author">Auteur</option>',
        mine: '<option value="update">Derniere MAJ</option>'
            + '<option value="active">En cours de maintenance d\'abord</option>'
            + '<option value="id">ID</option>',
        logs: '<option value="date">Date (recent)</option>'
            + '<option value="id">ID</option>'
            + '<option value="author">Auteur</option>'
            + '<option value="action">Action</option>'
      };

      // --- construction de la toolbar ---
      var tb = ''
        + '    <div class="omni-tb-field omni-search-wrap" style="flex:1;">'
        + '      <label>Recherche</label>'
        + '      <div class="omni-search-wrap">'
        + '        <span class="omni-ic">&#128269;</span>'
        + '        <input type="text" id="omni-q" autocomplete="off" placeholder="' + placeholderByMode[MODE] + '"/>'
        + '        <button class="omni-clear" id="omni-q-clear" title="Effacer">&times;</button>'
        + '      </div>'
        + '    </div>';

      // bouton Rechercher : search uniquement
      if (IS_SEARCH) {
        tb += '    <div class="omni-tb-field"><label>&nbsp;</label>'
            + '      <button class="omni-btn omni-btn--primary" id="omni-go" title="Lancer la recherche">&#128269; Rechercher</button></div>';
      }

      // chips Action : logs uniquement
      if (IS_LOGS) {
        tb += '    <div class="omni-tb-field"><label>Action</label>'
            + '      <div class="omni-chips" id="omni-action">'
            + '        <div class="omni-chip is-active" data-v="all">Toutes</div>'
            + '        <div class="omni-chip" data-v="add">Ajout</div>'
            + '        <div class="omni-chip" data-v="update">Modif.</div>'
            + '        <div class="omni-chip" data-v="delete">Suppr.</div>'
            + '      </div></div>';
      }

      // date "statut a la date" : search / mine
      if (!IS_LOGS) {
        tb += '    <div class="omni-tb-field"><label>Statut a la date</label>'
            + '      <input type="datetime-local" class="omni-input" id="omni-date"/></div>';
      }

      // chips Type : tous
      tb += '    <div class="omni-tb-field"><label>Type</label>'
          + '      <div class="omni-chips" id="omni-cat">'
          + '        <div class="omni-chip is-active" data-v="all">Tous</div>'
          + '        <div class="omni-chip" data-v="itsi">ITSI</div>'
          + '        <div class="omni-chip" data-v="custom">Custom</div>'
          + '      </div></div>';

      // chips Statut (enabled / disabled / les deux) : tous
      tb += '    <div class="omni-tb-field"><label>Statut</label>'
          + '      <div class="omni-chips" id="omni-status">'
          + '        <div class="omni-chip is-active" data-v="all">Tous</div>'
          + '        <div class="omni-chip" data-v="enabled">Activees</div>'
          + '        <div class="omni-chip" data-v="disabled">Desactivees</div>'
          + '      </div></div>';

      // tri
      tb += '    <div class="omni-tb-field"><label>Tri</label>'
          + '      <select class="omni-select" id="omni-sort">' + sortByMode[MODE] + '</select></div>';

      // "en cours uniquement" : search / mine
      if (!IS_LOGS) {
        tb += '    <div class="omni-tb-field"><label>&nbsp;</label>'
            + '      <label class="omni-toggle"><input type="checkbox" id="omni-active-only"/> En cours uniquement</label></div>';
      }

      // refresh + help + debug
      tb += '    <div class="omni-tb-field"><label>&nbsp;</label>'
          + '      <button class="omni-iconbtn" id="omni-refresh" title="Rafraichir">&#8635;</button></div>'
          + '    <div class="omni-tb-field"><label>&nbsp;</label>'
          + '      <button class="omni-iconbtn" id="omni-help" title="Aide">?</button></div>'
          + (Config.debug
              ? '    <div class="omni-tb-field"><label>&nbsp;</label>'
                + '      <button class="omni-iconbtn" id="omni-debug" title="Debug : requetes SPL &amp; etat">&#128027;</button></div>'
              : '');

      // legende
      var legend = IS_LOGS
        ? '<span><span class="dot add"></span>Ajout</span>'
          + '<span><span class="dot update"></span>Modification</span>'
          + '<span><span class="dot delete"></span>Suppression</span>'
        : '<span><span class="dot up"></span>En période de maintenance</span>'
          + '<span><span class="dot down"></span>Hors période de maintenance</span>';

      var html = ''
        + '<a class="omni-back" href="./accueil">&#8592; Menu des Maintenances</a>'
        + '<div class="omni-card">'
        + '  <div class="omni-header">'
        + '    <img src="/static/app/' + Config.appPath + '/media/logo_omni.png" style="height:34px" onerror="this.style.display=\'none\'"/>'
        + '    <h1>' + titleByMode[MODE] + '</h1>'
        + '    ' + badgeHtml
        + '  </div>'
        + '  <div class="omni-toolbar">' + tb + '</div>'
        + '  <div class="omni-meta">'
        + '    <div class="omni-count" id="omni-count"></div>'
        + '    <div class="omni-legend">' + legend + '</div>'
        + '  </div>'
        + '  <div class="omni-results" id="omni-results"></div>'
        + '  <div class="omni-pagination" id="omni-pagination"></div>'
        + '</div>'
        + '<div class="omni-loader" id="omni-loader">'
        + '  <div class="omni-loader__msg"><span class="omni-loader__msg-txt">Chargement…</span><span class="omni-loader__pct">0%</span></div>'
        + '  <div class="omni-loader__track"><div class="omni-loader__bar"></div></div>'
        + '</div>'
        + '<div class="omni-modal" id="omni-modal"><div class="omni-modal__box">'
        + '  <div class="omni-modal__head" id="omni-modal-head">Information</div>'
        + '  <div class="omni-modal__body" id="omni-modal-body"></div>'
        + '  <div class="omni-modal__foot"><button class="omni-btn omni-btn--ghost" id="omni-modal-close">Fermer</button></div>'
        + '</div></div>';

      $('#' + Config.mountId).html(html);
      if (!IS_LOGS) $('#omni-date').val(Util.nowInputValue());
      $('#omni-modal-close').on('click', UI.closeModal);
    },

    modal: function (title, body, kind) {
      $('#omni-modal-head').attr('class', 'omni-modal__head' + (kind ? ' is-' + kind : '')).html(title);
      $('#omni-modal-body').html(body);
      $('#omni-modal').addClass('is-open');
    },
    closeModal: function () { $('#omni-modal').removeClass('is-open'); }
  };

  /* ============================================================
   *  RENDU DES CARTES
   * ============================================================ */
  var Render = {
    tags: function (val, terms) {
      if (val == null || val === '') return '';
      if (val === '*') return '<span class="tag">Tous</span>';
      return String(val).split(';').map(function (x) {
        x = x.trim(); if (!x) return '';
        return '<span class="tag">' + Util.hl(Util.esc(x), terms) + '</span>';
      }).join('');
    },

    // marqueur du status GLOBAL (champ "status" hors json) -> pastille sur la carte
    gstatus: function (val) {
      var raw = String(val == null ? '' : val).toLowerCase().trim();
      if (raw === '') return '';   // pas de status -> pas de marqueur (anciens enregistrements)
      var on = Util.statusOn(val);
      return '<span class="dt-gstatus dt-gstatus--' + (on ? 'on' : 'off') + '" title="'
        + (on ? 'Maintenance activee' : 'Maintenance desactivee') + '">'
        + (on ? 'Activee' : 'Desactivee') + '</span>';
    },

    periods: function (json) {
      var arr = [];
      try { arr = JSON.parse(json) || []; } catch (e) { arr = []; }
      if (!arr.length) return IS_LOGS ? '<i>Aucune periode definie.</i>' : '';
      var rows = arr.map(function (p) {
        var type = DT_TYPE_FR[p.dt_type] || p.dt_type || '';
        var st = String(p.status == null ? '' : p.status).toLowerCase().trim();
        var on = Util.statusOn(p.status);
        // marqueur d'etat de la periode (vide si aucun status porte par l'objet)
        var statusBadge = (st === '')
          ? ''
          : '<span class="dt-status dt-status--' + (on ? 'on' : 'off') + '" title="'
            + (on ? 'Periode active' : 'Periode desactivee') + '"></span>';
        return '<tr class="dt_period"><td><b>' + Util.esc(p.id || '') + '</b> ' + statusBadge + '</td><td colspan="5"><hr/></td></tr>'
          + '<tr class="dt_period">'
          + '<td><b>Type:</b></td><td><span class="tag_dt">' + Util.esc(type) + '</span></td>'
          + '<td><b>Debut:</b></td><td><span class="tag_dt">' + Util.esc((p.begin_date || '') + ' ' + (p.begin_time || '')) + '</span></td>'
          + '<td><b>Fin:</b></td><td><span class="tag_dt">' + Util.esc((p.end_date || '') + ' ' + (p.end_time || '')) + '</span></td>'
          + '</tr>';
      }).join('');
      return '<table width="100%">' + rows + '</table>';
    },

    // carte mode logs (badge action + version, sans LED, 3 options)
    cardLogs: function (m, terms) {
      var action = String(m.action || '').toLowerCase();
      var actBadge = '<span class="dt-action-badge dt-action-' + (action || 'update') + '">'
        + Util.esc(ACTION_FR[action] || action || '?') + '</span>';
      var catBadge = m.category === 'CUSTOM'
        ? '<span class="dt-type-badge dt-type-custom">CUSTOM</span>'
        : '<span class="dt-type-badge dt-type-itsi">ITSI</span>';
      var gBadge = Render.gstatus(m.status);   // marqueur status GLOBAL

      var modifyHref = (m.category === 'CUSTOM'
        ? './omni__maintenance_custom?mode=update_custom&dt_id=' + Util.enc(m.ID) + '&selected_version=' + Util.enc(m.version)
        : './omni__maintenance_itsi?mode=update&dt_id=' + Util.enc(m.ID)) + '&selected_version=' + Util.enc(m.version);
      var activatorHref = './omni__maintenance_activator?form.DT_ID=' + Util.enc(m.ID);
      var deleteHref = (m.category === 'CUSTOM'
        ? './omni__maintenance_custom?mode=delete&dt_id=' + Util.enc(m.ID)
        : './omni__maintenance_itsi?mode=delete&dt_id=' + Util.enc(m.ID));
      var media = '/static/app/' + Config.appPath + '/media/';

      var filterBlock = (m.dt_filter)
        ? '<span class="fieldlist">Custom filter(s) : </span>' + Render.tags(m.dt_filter, terms) + '<br>'
        : '';
      var policyBlock = '<span class="fieldlist">policy(s) : </span>' + Render.tags(m.dt_policy, terms) + '<br>';
      var panelId = 'omni-panel-' + Util.esc(m.ID) + '-' + Util.esc(m.version);

      // --- decision d'affichage des options ---
      // info derniere version de l'ID (calculee une fois dans App.computeLogsLatest)
      var info     = Store.latestById[String(m.ID)] || {};
      var idDeleted = (info.action === 'delete');                       // derniere version = suppression
      var isLatest  = (parseInt(m.version, 10) === info.maxVersion);    // cette carte est la derniere version

      var optionsBlock;
      if (idDeleted) {
        // l'ID a ete supprime dans sa derniere version : aucune option sur TOUTES ses cartes
        optionsBlock = '<div class="search-option">'
          + '  <div class="title-search last-col">OPTIONS</div>'
          + '  <div class="tag-search-li" style="margin-top:8px;">Maintenance supprimee</div>'
          + '</div>';
      } else if (!isLatest) {
        // version ancienne d'un ID actif : on n'autorise pas l'edition de valeurs obsoletes
        optionsBlock = '<div class="search-option">'
          + '  <div class="title-search last-col">OPTIONS</div>'
          + '  <div class="tag-search-li" style="margin-top:8px;">Version obsolete</div>'
          + '</div>';
      } else {
        // derniere version d'un ID actif : options completes
        optionsBlock = '<div class="search-option">'
          + '  <div class="title-search last-col">OPTIONS</div>'
          + '  <a href="' + modifyHref + '" target="_blank" title="Modifier"><img class="img-option" src="' + media + 'browser.gif" width="68px" alt="Modifier"/></a>'
          + '  <a href="' + activatorHref + '" target="_blank" title="Portee"><img class="img-option" src="' + media + 'controls.gif" width="68px" alt="Portee"/></a>'
          + '  <a href="' + deleteHref + '" target="_blank" title="Supprimer"><img class="img-option" src="' + media + 'poubelle.gif" width="58px" alt="Supprimer"/></a>'
          + '</div>';
      }

      return ''
        + '<div class="row-search">'
        + '  <div class="col-search">'
        + '    <div class="title-search">' + actBadge + ' ' + catBadge + ' ' + gBadge + ' ID [ ' + Util.hl(Util.esc(m.ID), terms) + ' ]'
        + '      <span class="tag-search-li"><b class="search-bold">Version:</b> ' + Util.esc(m.version) + '</span>'
        + '      <span class="tag-search-li"><b class="search-bold">Auteur:</b> ' + Util.hl(Util.esc(m.creator), terms) + '</span>'
        + '      <span class="tag-search-li"><b class="search-bold">Date:</b> ' + Util.esc(m.last_update) + '</span>'
        + '    </div>'
        + '    <span class="fieldlist">entity : </span>' + Render.tags(m.entity, terms) + '<br>'
        + '    <span class="fieldlist">kpi : </span>' + Render.tags(m.kpi, terms) + '<br>'
        + '    <span class="fieldlist">service : </span>' + Render.tags(m.service, terms) + '<br>'
        + filterBlock + policyBlock
        + '    <div class="accordion">'
        + '      <input type="checkbox" name="panel" id="' + panelId + '"/>'
        + '      <label for="' + panelId + '">Informations complementaires (' + (m.nbperiode || 0) + ' periode(s))</label>'
        + '      <div class="accordion__content accordion__content--small">'
        + '        <div class="accordion__body">' + Render.periods(m.downtime_json)
        + '          <blockquote class="comment-block"><b>Commentaire :</b> <span class="tag_comment">' + Util.hl(Util.esc(m.commentary || ''), terms) + '</span></blockquote>'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + optionsBlock
        + '</div>';
    },

    // carte mode search / mine (LED actif/inactif a la date, badge status global, 4 options)
    cardLive: function (m, terms) {
      var active = String(m.flag_dt) === '1';
      var led = '<span class="led" type="' + (active ? 'up' : 'down') + '"></span>';
      var badge = m.category === 'ITSI'
        ? '<span class="dt-type-badge dt-type-itsi">ITSI</span>'
        : '<span class="dt-type-badge dt-type-custom">CUSTOM</span>';
      var gBadge = Render.gstatus(m.status);   // marqueur status GLOBAL (enabled/disabled)

      var modifyHref = (m.category === 'ITSI'
        ? './omni__maintenance_itsi?mode=update&dt_id=' + Util.enc(m.ID) + '&selected_version=' + Util.enc(m.version)
        : './omni__maintenance_custom?mode=update_custom&dt_id=' + Util.enc(m.ID)) + '&selected_version=' + Util.enc(m.version);
      var deleteHref = (m.category === 'CUSTOM'
        ? './omni__maintenance_custom?mode=delete&dt_id=' + Util.enc(m.ID)
        : './omni__maintenance_itsi?mode=delete&dt_id=' + Util.enc(m.ID));
      var logsHref = './omni__maintenance_logs?form.input_ID=' + Util.enc(m.ID);
      var activatorHref = './omni__maintenance_activator?form.DT_ID=' + Util.enc(m.ID);
      var media = '/static/app/' + Config.appPath + '/media/';

      var filterBlock = (m.dt_filter && m.step_opt === '000')
        ? '<span class="fieldlist">Custom filter(s) : </span>' + Render.tags(m.dt_filter, terms) + '<br>'
        : '';
      var policyBlock = '<span class="fieldlist">policy(s) : </span>' + Render.tags(m.dt_policy, terms) + '<br>';

      return ''
        + '<div class="row-search">'
        + '  <div class="col-search">'
        + '    <div class="title-search">' + badge + ' ' + gBadge + ' ID [ ' + Util.hl(Util.esc(m.ID), terms) + ' ] ' + led
        + '      <span class="tag-search-li"><b class="search-bold">Auteur:</b> ' + Util.hl(Util.esc(m.creator), terms) + '</span>'
        + '      <span class="tag-search-li"><b class="search-bold">Derniere MAJ:</b> ' + Util.esc(m.last_update) + '</span>'
        + '    </div>'
        + '    <span class="fieldlist">entity : </span>' + Render.tags(m.entity, terms) + '<br>'
        + '    <span class="fieldlist">kpi : </span>' + Render.tags(m.kpi, terms) + '<br>'
        + '    <span class="fieldlist">service : </span>' + Render.tags(m.service, terms) + '<br>'
        + filterBlock + policyBlock
        + '    <div class="accordion">'
        + '      <input type="checkbox" name="panel" id="omni-panel-' + Util.esc(m.ID) + '"/>'
        + '      <label for="omni-panel-' + Util.esc(m.ID) + '">Informations complementaires (' + (m.nbperiode || 0) + ' periode(s))</label>'
        + '      <div class="accordion__content accordion__content--small">'
        + '        <div class="accordion__body">' + Render.periods(m.downtime_json)
        + '          <blockquote class="comment-block"><b>Commentaire :</b> <span class="tag_comment">' + Util.hl(Util.esc(m.commentary || ''), terms) + '</span></blockquote>'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '  <div class="search-option">'
        + '    <div class="title-search last-col">OPTIONS</div>'
        + '    <a href="' + logsHref + '" target="_blank" title="Trace Logs"><img class="img-option" src="' + media + 'analytics.gif" width="68px" alt="Logs"/></a>'
        + '    <a href="' + modifyHref + '" target="_blank" title="Modifier"><img class="img-option" src="' + media + 'browser.gif" width="68px" alt="Modifier"/></a>'
        + '    <a href="' + activatorHref  + '" target="_blank" title="Portee"><img class="img-option" src="' + media + 'controls.gif" width="68px" alt="Portee"/></a>'
        + '    <a href="' + deleteHref + '" target="_blank" title="Supprimer"><img class="img-option" src="' + media + 'poubelle.gif" width="58px" alt="Supprimer"/></a>'
        + '  </div>'
        + '</div>';
    },

    card: function (m, terms) {
      return IS_LOGS ? Render.cardLogs(m, terms) : Render.cardLive(m, terms);
    }
  };

  /* ============================================================
   *  APP  -  chargement / filtrage / tri / pagination
   * ============================================================ */
  var App = {

    init: function () {
      log('init ' + MODE + ' : ' + Config.view + ' | rows/page=' + Config.rowsPerPage
        + (IS_SEARCH ? ' | clientScope=' + Config.clientScope : ''), 'etape > init');
      App.bindToolbar();

      // logs : ID pre-selectionne via lien depuis la recherche
      if (IS_LOGS && Config.preID) {
        $('#omni-q').val(Config.preID);
        $('#omni-q-clear').show();
        Store.term = Config.preID;
      }

      App.loadData();
    },

    // logs : pour chaque ID -> version max + action de cette version max.
    // sert a decider l'affichage des options (suppression / version obsolete).
    computeLogsLatest: function () {
      var byId = {};
      Store.all.forEach(function (m) {
        var id  = String(m.ID);
        var v   = parseInt(m.version, 10); if (isNaN(v)) v = -1;
        var act = String(m.action || '').toLowerCase();
        var cur = byId[id];
        if (!cur || v > cur.maxVersion) {
          byId[id] = { maxVersion: v, action: act };
        } else if (v === cur.maxVersion && act === 'delete') {
          // au cas (rare) ou deux entrees partagent la version max : la suppression prime
          cur.action = 'delete';
        }
      });
      Store.latestById = byId;
      log(byId, 'etape > latestById (logs)');
    },

    loadData: function () {
      var t0 = Date.now();

      var loadMsg = IS_LOGS ? 'Chargement de l\'historique…'
        : (IS_MINE ? 'Chargement de vos maintenances…' : 'Chargement des maintenances…');

      var emptyErr = '<div class="omni-empty">Erreur de chargement. Verifiez les logs Splunk.</div>';

      var runMain = function () {
        var spl = IS_LOGS ? SPL.logs()
          : (IS_MINE ? SPL.mineMain(Store.epoch, Store.user)
                     : SPL.searchMain(Store.epoch, Store.clientWhere));

        SearchHub.run(MAIN_ID, spl, {
          message: loadMsg,
          count: 0,
          earliest: '0', latest: 'now',
          onResults: function (rows) {
            Store.all = rows.map(rowToObj);
            if (IS_LOGS) App.computeLogsLatest();   // pre-calcul derniere version par ID
            Store.loadTime = ((Date.now() - t0) / 1000).toFixed(2);
            log('lignes chargees : ' + Store.all.length + ' en ' + Store.loadTime + 's', 'etape > donnees recues');
            App.applyFilters();
          },
          onError: function () { $('#omni-results').html(emptyErr); }
        });
      };

      if (IS_SEARCH && Config.clientScope) {
        // RBAC : on resout d'abord le filtre client
        SearchHub.run('clientFilter', SPL.clientFilter, {
          message: 'Resolution des droits…',
          count: 0,
          onResults: function (rows) {
            var filtres = [];
            rows.forEach(function (r) { if (r[0]) filtres.push(r[0]); });
            var isAll = !filtres.length || filtres.indexOf('client=*') !== -1;
            Store.clientWhere = isAll ? '' : '| search (' + filtres.join(' OR ') + ')';
            log(Store.clientWhere, 'clientWhere');
            runMain();
          },
          onError: runMain
        });
      } else if (IS_MINE) {
        // on resout l'utilisateur courant une seule fois
        if (Store.userResolved) { runMain(); return; }
        SearchHub.run('me', SPL.me, {
          message: 'Identification de l\'utilisateur…',
          count: 1,
          onResults: function (rows) {
            Store.user = (rows[0] && rows[0][0]) ? rows[0][0] : '';
            Store.userResolved = true;
            $('#omni-user-badge').text(Store.user || 'perso');
            log('utilisateur courant = ' + Store.user, 'etape > current-context');
            runMain();
          },
          onError: function () {
            // a defaut, on charge sans filtre creator
            Store.user = '*'; Store.userResolved = true; runMain();
          }
        });
      } else {
        runMain();
      }
    },

    applyFilters: function () {
      var parsed = Util.parseQuery(Store.term);
      Store.hlTerms = parsed.hlTerms;

      Store.filtered = Store.all.filter(function (m) {
        if (IS_LOGS) {
          if (Store.action !== 'all' && String(m.action).toLowerCase() !== Store.action) return false;
        } else {
          if (Store.activeOnly && String(m.flag_dt) !== '1') return false;
        }
        if (Store.category !== 'all' && String(m.category).toLowerCase() !== Store.category) return false;

        // filtre status GLOBAL (enabled / disabled). "all" = les deux.
        if (Store.statusFilter !== 'all') {
          var on = Util.statusOn(m.status);
          if (Store.statusFilter === 'enabled' && !on) return false;
          if (Store.statusFilter === 'disabled' && on) return false;
        }

        var blob = String(m.search_blob || '');
        for (var i = 0; i < parsed.matchers.length; i++) {
          if (!parsed.matchers[i](blob)) return false;
        }
        return true;
      });

      var s = Store.sort;
      Store.filtered.sort(function (a, b) {
        if (s === 'id') return String(a.ID).localeCompare(String(b.ID));
        if (s === 'author') return String(a.creator).localeCompare(String(b.creator));
        if (s === 'action') return String(a.action).localeCompare(String(b.action));
        if (s === 'active') {
          var d = (b.flag_dt === '1' ? 1 : 0) - (a.flag_dt === '1' ? 1 : 0);
          return d !== 0 ? d : String(b.last_update).localeCompare(String(a.last_update));
        }
        if (s === 'date') return (parseInt(b.dt_update, 10) || 0) - (parseInt(a.dt_update, 10) || 0);
        return String(b.last_update).localeCompare(String(a.last_update)); // update desc
      });

      Store.page = 0;
      log({ terme: Store.term, type: Store.category, statut: Store.statusFilter,
        action: Store.action, enCours: Store.activeOnly, tri: Store.sort,
        resultats: Store.filtered.length + '/' + Store.all.length }, 'etape > applyFilters');
      App.render();
    },

    render: function () {
      var terms = Store.hlTerms || [];
      var total = Store.filtered.length;
      var per = Config.rowsPerPage;
      var start = Store.page * per;
      var slice = Store.filtered.slice(start, start + per);

      var noun = IS_LOGS ? 'evenement' : 'resultat';
      $('#omni-count').html(total
        ? total + ' ' + noun + (total > 1 ? 's' : '') + ' <small>(charge en ' + Store.loadTime + 's)</small>'
        : 'Aucun resultat');

      if (!slice.length) {
        var emptyMsg;
        if (Store.all.length) {
          emptyMsg = IS_LOGS ? 'Aucun evenement ne correspond a vos criteres.'
                             : 'Aucune maintenance ne correspond a vos criteres.';
        } else {
          emptyMsg = IS_LOGS ? 'Aucun evenement enregistre.'
            : (IS_MINE ? 'Vous n\'avez aucune maintenance enregistree.'
                       : 'Aucune maintenance enregistree.');
        }
        $('#omni-results').html('<div class="omni-empty">' + emptyMsg + '</div>');
      } else {
        $('#omni-results').html(slice.map(function (m) { return Render.card(m, terms); }).join(''));
      }

      App.renderPagination();
      log('page ' + (Store.page + 1) + ' | ' + slice.length + ' carte(s)', 'etape > render');
    },

    renderPagination: function () {
      var per = Config.rowsPerPage;
      var pages = Math.ceil(Store.filtered.length / per);
      var $p = $('#omni-pagination').empty();
      if (pages <= 1) return;
      var cur = Store.page;

      var item = function (label, idx, cls) {
        return '<a href="#" class="' + (cls || '') + '" data-i="' + idx + '">' + label + '</a>';
      };
      var html = '';
      html += item('&lsaquo;', Math.max(0, cur - 1), 'nav');
      var win = 2, last = null;
      for (var i = 0; i < pages; i++) {
        if (i === 0 || i === pages - 1 || (i >= cur - win && i <= cur + win)) {
          html += item(i + 1, i, i === cur ? 'active' : '');
          last = i;
        } else if (last !== '…') {
          html += '<span class="gap">…</span>'; last = '…';
        }
      }
      html += item('&rsaquo;', Math.min(pages - 1, cur + 1), 'nav');
      $p.html(html);

      $p.find('a').on('click', function (e) {
        e.preventDefault();
        Store.page = parseInt($(this).attr('data-i'), 10);
        App.render();
        $('html,body').animate({ scrollTop: $('#omni-results').offset().top - 20 }, 200);
      });
    },

    bindToolbar: function () {
      var debounce;
      var doSearch = function (v) {
        Store.term = (v != null ? v : ($('#omni-q').val() || ''));
        log('terme = "' + Store.term + '"', 'etape > recherche');
        App.applyFilters();
      };
      $('#omni-q').on('input', function () {
        var v = this.value;
        $('#omni-q-clear').toggle(!!v);
        clearTimeout(debounce);
        debounce = setTimeout(function () { doSearch(v); }, 180);
      }).on('keydown', function (e) {
        if (e.key === 'Enter') { clearTimeout(debounce); doSearch(this.value); }
        else if (e.key === 'Escape') { this.value = ''; $('#omni-q-clear').hide(); doSearch(''); }
      });
      $('#omni-q-clear').on('click', function () {
        $('#omni-q').val('').focus(); $(this).hide(); doSearch('');
      });

      // bouton Rechercher (search uniquement)
      $('#omni-go').on('click', function () { clearTimeout(debounce); doSearch(); });

      // chips Action (logs)
      $('#omni-action .omni-chip').on('click', function () {
        $('#omni-action .omni-chip').removeClass('is-active'); $(this).addClass('is-active');
        Store.action = $(this).attr('data-v');
        App.applyFilters();
      });

      // chips Type (tous)
      $('#omni-cat .omni-chip').on('click', function () {
        $('#omni-cat .omni-chip').removeClass('is-active'); $(this).addClass('is-active');
        Store.category = $(this).attr('data-v');
        App.applyFilters();
      });

      // chips Statut global enabled/disabled (tous)
      $('#omni-status .omni-chip').on('click', function () {
        $('#omni-status .omni-chip').removeClass('is-active'); $(this).addClass('is-active');
        Store.statusFilter = $(this).attr('data-v');
        App.applyFilters();
      });

      // tri
      $('#omni-sort').on('change', function () {
        Store.sort = this.value;
        App.applyFilters();
      });

      // "en cours uniquement" (search / mine)
      $('#omni-active-only').on('change', function () {
        Store.activeOnly = this.checked;
        App.applyFilters();
      });

      // changement de date -> recalcul serveur (search / mine ; flag_dt depend de la date)
      $('#omni-date').on('change', function () {
        Store.epoch = Util.epochFromInput(this.value);
        log('date changee -> rechargement serveur', 'etape > date');
        App.loadData();
      });

      $('#omni-refresh').on('click', function () {
        log('rafraichissement manuel', 'etape > refresh');
        App.loadData();
      });

      $('#omni-help').on('click', App.showHelp);
      $('#omni-debug').on('click', App.showDebug);
    },

    showHelp: function () {
      if (IS_LOGS) {
        UI.modal('Omni Assistant', ''
          + '<h3>Journal des maintenances</h3>'
          + '<p>Chaque carte represente une <b>action</b> (ajout, modification, suppression) effectuee sur une maintenance, '
          + 'avec la version concernee et l\'auteur. Les actions <i>obsolete</i> sont masquees.</p>'
          + '<h3>Options des cartes</h3>'
          + '<p>Les boutons d\'action ne sont disponibles que sur la <b>derniere version</b> d\'un ID, afin d\'eviter '
          + 'de modifier une maintenance a partir de valeurs obsoletes. Si la derniere version d\'un ID est une '
          + '<b>suppression</b>, aucune option n\'est proposee sur ses cartes.</p>'
          + '<h3>Statut</h3>'
          + '<p>La pastille <b>Activee / Desactivee</b> a cote de l\'ID reflete le status <b>global</b> de la maintenance '
          + '(champ hors json). Dans les informations complementaires, chaque periode affiche son <b>propre marqueur</b> '
          + 'd\'etat (actif/desactive). Le filtre <b>Statut</b> permet de n\'afficher que les maintenances activees, '
          + 'desactivees, ou les deux.</p>'
          + '<h3>Recherche</h3>'
          + '<p>Chaque mot saisi est cherche dans tous les champs (ID, auteur, service, kpi, entity, commentaire, action…). '
          + 'Plusieurs mots = <b>ET</b>. Jokers <code>*</code> et <code>?</code> acceptes.</p>'
          + '<h3>Filtres</h3>'
          + '<p><b>Action</b>, <b>Type</b> (ITSI/Custom), <b>Statut</b> et <b>Tri</b> s\'appliquent instantanement.</p>');
        return;
      }
      if (IS_MINE) {
        UI.modal('Omni Assistant', ''
          + '<h3>Mes maintenances</h3>'
          + '<p>Cet ecran liste uniquement les maintenances dont <b>vous etes l\'auteur</b> (creator).</p>'
          + '<h3>Statut</h3>'
          + '<p>La LED ronde indique si la maintenance est <b>en période de maintenance</b>. La pastille '
          + '<b>Activee / Desactivee</b> reflete le status <b>global</b> enregistre (champ hors json). '
          + 'Chaque periode affiche en plus son propre marqueur d\'etat dans les informations complementaires. '
          + 'Le filtre <b>Statut</b> restreint l\'affichage aux maintenances activees, desactivees, ou les deux.</p>'
          + '<h3>Recherche</h3>'
          + '<p>Chaque mot est cherche dans tous les champs (ID, service, kpi, entity, commentaire, policy, filtre…). '
          + 'Plusieurs mots = <b>ET</b>. Jokers <code>*</code> et <code>?</code> acceptes.</p>'
          + '<h3>Filtres</h3>'
          + '<p><b>Statut a la date</b> recalcule si chaque maintenance est en période de maintenance a la date choisie. '
          + '<b>En cours uniquement</b>, <b>Type</b>, <b>Statut</b> et <b>Tri</b> s\'appliquent instantanement.</p>');
        return;
      }
      UI.modal('Omni Assistant', ''
        + '<h3>Recherche</h3>'
        + '<p>La barre fonctionne comme un moteur de recherche : chaque mot saisi est recherche '
        + 'dans tous les champs (ID, auteur, service, kpi, entity, commentaire, policy, filtre, client, site, sonde…). '
        + 'Plusieurs mots sont combines en <b>ET</b>. Plus c\'est precis, mieux c\'est.</p>'
        + '<ul>'
        + '<li>Un equipement avec son site et l\'auteur : <code>SRVTEST1 LYON jdupont</code></li>'
        + '<li>Une reference ticket : <code>R-287656</code></li>'
        + '<li>Joker <code>*</code> et <code>?</code> acceptes : <code>srv*prod</code>, <code>SRV?01</code>. '
        + '<code>*</code> seul affiche tout.</li>'
        + '</ul>'
        + '<h3>Statut</h3>'
        + '<p>La LED ronde indique si la maintenance est <b>en période de maintenance</b>. La pastille '
        + '<b>Activee / Desactivee</b> reflete le status <b>global</b> enregistre (champ hors json), et chaque '
        + 'periode affiche son propre marqueur d\'etat dans les informations complementaires. '
        + 'Le filtre <b>Statut</b> restreint l\'affichage aux maintenances activees, desactivees, ou les deux.</p>'
        + '<h3>Filtres</h3>'
        + '<p><b>Statut a la date</b> recalcule si chaque maintenance est en période de maintenance a la date/heure choisie. '
        + '<b>En cours uniquement</b>, <b>Type</b> (ITSI/Custom), <b>Statut</b> et <b>Tri</b> s\'appliquent instantanement.</p>');
    },

    showDebug: function () {
      var q = Store.lastQueries || {};
      var section = function (titre, spl) {
        return '<div class="omni-dbg-h">' + titre + '</div><div class="omni-dbg">'
          + Util.esc(spl || '(non executee)') + '</div>';
      };

      var etat, body;
      if (IS_LOGS) {
        etat = {
          mode: MODE, view: Config.view, rowsPerPage: Config.rowsPerPage,
          chargees: Store.all.length, affichees: Store.filtered.length,
          ids_traces: Object.keys(Store.latestById).length,
          terme: Store.term, action: Store.action, type: Store.category, statut: Store.statusFilter, tri: Store.sort,
          page: Store.page, loadTime: Store.loadTime + 's'
        };
        body = section('Requete journal (donnees)', q.logs);
      } else if (IS_MINE) {
        etat = {
          mode: MODE, view: Config.view, rowsPerPage: Config.rowsPerPage, utilisateur: Store.user,
          epoch: Store.epoch, date: new Date(Store.epoch * 1000).toLocaleString(),
          chargees: Store.all.length, affichees: Store.filtered.length,
          terme: Store.term, type: Store.category, statut: Store.statusFilter, enCours: Store.activeOnly, tri: Store.sort,
          page: Store.page, loadTime: Store.loadTime + 's'
        };
        body = section('Requete utilisateur courant', q.me)
             + section('Requete principale (donnees)', q.main);
      } else {
        etat = {
          mode: MODE, view: Config.view, clientScope: Config.clientScope, rowsPerPage: Config.rowsPerPage,
          epoch: Store.epoch, date: new Date(Store.epoch * 1000).toLocaleString(),
          clientWhere: Store.clientWhere || '(aucun)',
          chargees: Store.all.length, affichees: Store.filtered.length,
          terme: Store.term, type: Store.category, statut: Store.statusFilter, enCours: Store.activeOnly, tri: Store.sort,
          page: Store.page, loadTime: Store.loadTime + 's'
        };
        body = section('Requete principale (donnees)', q.main)
             + (Config.clientScope ? section('Requete RBAC (filtre client)', q.clientFilter) : '');
      }

      log(etat, 'Debug : etat courant');
      UI.modal('&#128027; Debug',
        body
        + '<div class="omni-dbg-h">Etat courant</div>'
        + '<div class="omni-dbg">' + Util.esc(JSON.stringify(etat, null, 2)) + '</div>'
        + '<p style="margin-top:12px;color:var(--omni-muted);font-size:12.5px">'
        + 'Les memes requetes et les etapes sont tracees dans la console JS.</p>');
    }
  };

  /* ============================================================
   *  BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config detectee (mode = ' + MODE + ')');
    UI.css();
    UI.shell();
    App.init();
  });

});