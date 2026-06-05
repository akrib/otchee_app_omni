/*
 *  Omni Maintenance Logs App  -  appli mono-page (full JS) pour ITSI Maintenance Logs
 *  Remplace : itsi__maintenance_logs.xml (table + omni_journal.js : cell renderer / row expansion)
 *             -> 1 seul JS, meme aspect que maintenance_search_app.js
 *
 *  Pourquoi l'ancien ne parsait plus le JSON :
 *   - le SPL avait le bloc spath / foreach COMMENTE => "downtime" arrivait mal forme
 *   - le parse JSON etait fait dans des cell renderers TableView (fragiles).
 *
 *  Principe (aligne sur maintenance_search_app.js) :
 *   - le SPL renvoie des DONNEES STRUCTUREES (downtime_json = vrai tableau JSON).
 *   - le HTML des cartes (et le JSON.parse) est fait ICI, en JS.
 *   - chargement unique de l'historique, puis filtrage / tri / pagination en memoire.
 */

var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '2.0.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance Logs App v' + APP_VERSION + ' charge');

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
   *  CONFIG
   * ============================================================ */
  var Config = (function () {
    function urlParam(name) {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
      return m ? decodeURIComponent(m[1]) : null;
    }
    var $cfg = $('#omni_logs_config');
    return {
      debug: (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1',
      rowsPerPage: parseInt(urlParam('rows') || $cfg.attr('data-rows') || '30', 10),
      // ID pre-selectionne (lien depuis la recherche : ?form.input_ID=...)
      preID: urlParam('form.input_ID') || urlParam('input_ID') || '',
      appPath: APP_NAME,
      view: utils.getPageInfo().page
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
   *  UTIL
   * ============================================================ */
  var Util = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    escRe: function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); },
    hl: function (escaped, terms) {
      if (!terms || !terms.length) return escaped;
      var re = new RegExp('(' + terms.map(Util.escRe).join('|') + ')', 'ig');
      return escaped.replace(re, '<mark class="omni-mark">$1</mark>');
    },
    enc: function (s) { return encodeURIComponent(s == null ? '' : s); },
    parseQuery: function (str) {
      var raw = String(str || '').toLowerCase().split(/\s+/).filter(Boolean);
      var matchers = [], hlTerms = [];
      raw.forEach(function (t) {
        if (t === '*' || t === '%') return;
        if (t.indexOf('*') !== -1 || t.indexOf('?') !== -1) {
          var pat = Util.escRe(t).replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
          var re = new RegExp(pat);
          matchers.push(function (blob) { return re.test(blob); });
          t.split(/[*?]+/).forEach(function (c) { if (c) hlTerms.push(c); });
        } else {
          matchers.push(function (blob) { return blob.indexOf(t) !== -1; });
          hlTerms.push(t);
        }
      });
      return { matchers: matchers, hlTerms: hlTerms };
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

  // actions -> libelle FR
  var ACTION_FR = {
    add: 'Ajout', update: 'Modification', delete: 'Suppression', obsolete: 'Obsolete'
  };

  /* ============================================================
   *  SEARCH HUB  -  loader global a pourcentage (identique a la recherche)
   * ============================================================ */
  var SearchHub = {
    _active: {},

    run: function (id, spl, opts) {
      opts = opts || {};
      var sm = new SearchManager(_.extend({
        id: 'omnil_' + id + '_' + Date.now(),
        preview: false,
        cache: false,
        autostart: true,
        search: opts.tokenSafe ? mvc.tokenSafe(spl) : spl,
        earliest_time: opts.earliest || '-24h@h',
        latest_time: opts.latest || 'now'
      }, opts.searchOpts || {}));

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
          var rs = sm.data('results', { count: opts.count || 0, output_mode: 'json_rows' });
          rs.on('data', function () {
            var d = rs.data() || {};
            var fields = (d.fields || []).map(function (f) { return (typeof f === 'string') ? f : (f && f.name) || f; });
            var rows = d.rows;
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
   *  REQUETE SPL  -  historique structure (JSON propre)
   * ============================================================ */
  var SPL = {
    logs: function () {
      return ''
        + '| inputlookup omni_kv_trace_log_def '
        + '| search NOT action="obsolete" '
        // >>> reconstruction du vrai tableau JSON (c'est ce qui manquait) :
        + '| eval downtime_json = "[" + mvjoin(downtime, ",") + "]" '
        + '| eval nbperiode = mvcount(downtime) '
        + '| eval entity=mvjoin(entity, ";"), kpi=mvjoin(kpi,";"), service=mvjoin(service, ";"), '
        + '       dt_policy=coalesce(dt_policy,"-") '
        + '| eval last_update=strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S") '
        + '| eval category=if(coalesce(step_opt,"")=="000","CUSTOM","ITSI") '
        + '| eval search_blob=lower(coalesce(ID,"")." ".coalesce(creator,"")." ".coalesce(entity,"")." "'
        + '       .coalesce(kpi,"")." ".coalesce(service,"")." ".coalesce(dt_filter,"")." ".coalesce(dt_policy,"")." "'
        + '       .coalesce(commentary,"")." ".coalesce(action,"")) '
        + '| sort 0 - dt_update '
        + '| table ID, creator, last_update, dt_update, action, version, category, entity, kpi, service, '
        + '        dt_filter, dt_policy, commentary, downtime_json, nbperiode, search_blob';
    }
  };

  var COLS = ['ID', 'creator', 'last_update', 'dt_update', 'action', 'version', 'category',
    'entity', 'kpi', 'service', 'dt_filter', 'dt_policy', 'commentary',
    'downtime_json', 'nbperiode', 'search_blob'];

  function rowToObj(r) {
    var o = {};
    for (var i = 0; i < COLS.length; i++) o[COLS[i]] = r[i];
    return o;
  }

  /* ============================================================
   *  STORE
   * ============================================================ */
  var Store = {
    all: [], filtered: [],
    page: 0, term: '', action: 'all', category: 'all', sort: 'date',
    loadTime: 0, hlTerms: [],
    lastQueries: {}
  };

  /* ============================================================
   *  UI  -  shell + composants (meme aspect que la recherche)
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-logs-style').length) return;
      var c = [
        ':root{--omni-primary:#23579d;--omni-primary-2:#1d3f73;--omni-accent:#fcb040;--omni-ok:#00cec9;--omni-err:#ff7675;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        '#omni_maintenance_logs_app{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:1180px;margin:0 auto;}',
        '#omni_maintenance_logs_app *{box-sizing:border-box;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:20px;margin:0;font-weight:600;letter-spacing:.3px;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        '.omni-toolbar{padding:18px 24px;display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;border-bottom:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-tb-field{display:flex;flex-direction:column;gap:6px;}',
        '.omni-tb-field label{font-size:12px;font-weight:600;color:var(--omni-muted);}',
        '.omni-search-wrap{position:relative;flex:1;min-width:260px;}',
        '.omni-search-wrap input{width:100%;border:1px solid var(--omni-line);border-radius:10px;padding:11px 38px 11px 38px;font-size:14px;font-family:inherit;}',
        '.omni-search-wrap input:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(35,87,157,.12);}',
        '.omni-search-wrap .omni-ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--omni-muted);font-size:15px;}',
        '.omni-search-wrap .omni-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--omni-muted);cursor:pointer;font-size:18px;line-height:1;display:none;}',
        '.omni-input,.omni-select{border:1px solid var(--omni-line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:#fff;}',
        '.omni-input:focus,.omni-select:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(35,87,157,.12);}',
        '.omni-chips{display:flex;gap:6px;flex-wrap:wrap;}',
        '.omni-chip{border:1px solid var(--omni-line);border-radius:999px;padding:8px 14px;cursor:pointer;font-size:13px;background:#fff;transition:.15s;}',
        '.omni-chip.is-active{border-color:var(--omni-primary);background:rgba(35,87,157,.08);color:var(--omni-primary);font-weight:600;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--ghost:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;display:inline-flex;align-items:center;gap:6px;}',
        '.omni-btn--primary:hover{background:var(--omni-primary-2);}',
        '.omni-dbg{background:#0f2238;color:#cfe6ff;border-radius:8px;padding:12px 14px;font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:38vh;}',
        '.omni-dbg-h{font-weight:600;color:var(--omni-primary);margin:14px 0 6px;font-size:13px;}',
        '.omni-iconbtn{width:40px;height:40px;border-radius:10px;border:1px solid var(--omni-line);background:#fff;cursor:pointer;font-size:16px;color:var(--omni-muted);}',
        '.omni-iconbtn:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        '.omni-meta{display:flex;flex-wrap:wrap;align-items:center;gap:18px;padding:14px 24px 4px;}',
        '.omni-count{font-size:16px;color:#34495e;font-weight:600;}',
        '.omni-count small{font-weight:400;color:var(--omni-muted);}',
        '.omni-legend{display:flex;gap:14px;font-size:12.5px;color:var(--omni-muted);margin-left:auto;align-items:center;flex-wrap:wrap;}',
        '.omni-legend .dot{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:middle;}',
        '.omni-legend .dot.add{background:#00b894;}.omni-legend .dot.update{background:#0984e3;}',
        '.omni-legend .dot.delete{background:#d63031;}.omni-legend .dot.obsolete{background:#636e72;}',
        '.omni-results{padding:8px 24px 8px;}',
        '.omni-empty{text-align:center;color:var(--omni-muted);padding:48px 12px;font-size:15px;}',
        '.row-search{box-shadow:0 5px 15px rgba(0,0,0,.10),0 6px 6px rgba(0,0,0,.08);border-radius:12px;background:#fff;margin:16px 0;overflow:hidden;display:flex;}',
        '.col-search{flex:1;padding:16px 18px;min-width:0;}',
        '.search-option{width:120px;background:#f7f9fc;border-left:1px solid var(--omni-line);padding:14px 8px;text-align:center;}',
        '.title-search{font-size:15px;font-weight:600;color:var(--omni-primary);display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px;}',
        '.title-search.last-col{justify-content:center;color:var(--omni-muted);font-size:12px;letter-spacing:.5px;margin-bottom:10px;}',
        '.tag-search-li{font-size:11.5px;color:var(--omni-muted);font-weight:400;margin-left:8px;}',
        '.tag-search-li .search-bold{color:var(--omni-ink);}',
        '.fieldlist{font-size:12.5px;color:var(--omni-muted);font-weight:600;margin-right:4px;}',
        '.tag{font-family:Roboto,sans-serif;font-size:12px;background:var(--omni-primary);border-radius:4px;color:#fff;display:inline-block;margin:3px 3px 3px 0!important;padding:3px 8px!important;}',
        '.tag_dt{font-family:Roboto,sans-serif;font-size:12px;background:#74b9ff;border-radius:4px;color:#fff;display:inline-block;margin:3px!important;padding:3px 8px!important;}',
        '.tag_comment{font-family:Roboto,sans-serif;font-size:12.5px;display:inline-block;padding:3px 4px!important;color:#222;}',
        '.comment-block{color:#000!important;border-left:3px solid var(--omni-accent);padding-left:10px;margin:8px 0 0;}',
        '.omni-mark{background:#ffe9a8;color:inherit;border-radius:3px;padding:0 1px;}',
        '.img-option{transition:.15s;}.img-option:hover{transform:scale(1.08);}',
        '.search-option a{display:inline-block;margin-bottom:6px;}',
        '.dt-type-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}',
        '.dt-type-itsi{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);box-shadow:0 2px 4px rgba(102,126,234,.3);}',
        '.dt-type-custom{background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);box-shadow:0 2px 4px rgba(245,87,108,.3);}',
        /* badges d'action (journal) */
        '.dt-action-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}',
        '.dt-action-add{background:linear-gradient(135deg,#00b894,#00cec9);box-shadow:0 2px 4px rgba(0,184,148,.3);}',
        '.dt-action-update{background:linear-gradient(135deg,#0984e3,#74b9ff);box-shadow:0 2px 4px rgba(9,132,227,.3);}',
        '.dt-action-delete{background:linear-gradient(135deg,#d63031,#ff7675);box-shadow:0 2px 4px rgba(214,48,49,.3);}',
        '.dt-action-obsolete{background:linear-gradient(135deg,#636e72,#b2bec3);box-shadow:0 2px 4px rgba(99,110,114,.3);}',
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
        '.omni-pagination{display:flex;justify-content:center;align-items:center;gap:6px;padding:8px 0 26px;flex-wrap:wrap;}',
        '.omni-pagination a{color:#fff;background:var(--omni-primary);border-radius:50%;min-width:30px;height:30px;line-height:30px;text-align:center;text-decoration:none;font-size:13px;padding:0 8px;}',
        '.omni-pagination a.active{background:#b4d6ff;color:var(--omni-primary-2);font-weight:700;}',
        '.omni-pagination a:hover:not(.active){background:var(--omni-primary-2);}',
        '.omni-pagination .nav{border-radius:8px;}',
        '.omni-pagination .gap{color:var(--omni-muted);padding:0 4px;}',
        '.omni-loader{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#0f2238;color:#fff;border-radius:12px;padding:14px 22px;min-width:280px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:.2s;z-index:9999;}',
        '.omni-loader.is-visible{opacity:1;}',
        '.omni-loader__msg{font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;}',
        '.omni-loader__track{height:8px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;}',
        '.omni-loader__bar{height:100%;width:5%;background:linear-gradient(90deg,var(--omni-accent),#ffd27a);border-radius:999px;transition:width .25s;}',
        '.omni-modal{position:fixed;inset:0;background:rgba(15,34,56,.55);display:none;align-items:center;justify-content:center;z-index:10000;}',
        '.omni-modal.is-open{display:flex;}',
        '.omni-modal__box{background:#fff;border-radius:14px;width:min(620px,92vw);max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);}',
        '.omni-modal__head{padding:16px 22px;background:var(--omni-primary);color:#fff;font-weight:600;}',
        '.omni-modal__head.is-err{background:var(--omni-err);}.omni-modal__head.is-ok{background:var(--omni-ok);}',
        '.omni-modal__body{padding:20px 22px;font-size:14px;line-height:1.55;}',
        '.omni-modal__body h3{margin:14px 0 6px;font-size:15px;color:var(--omni-primary);}',
        '.omni-modal__body ul{margin:6px 0 12px 18px;}',
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}'
      ].join('\n');
      $('<style id="omni-logs-style">').text(c).appendTo('head');
    },

    shell: function () {
      var html = ''
        + '<a class="omni-back" href="./accueil">&#8592; Menu des Maintenances</a>'
        + '<div class="omni-card">'
        + '  <div class="omni-header">'
        + '    <img src="/static/app/' + Config.appPath + '/media/logo_omni.png" style="height:34px" onerror="this.style.display=\'none\'"/>'
        + '    <h1>Maintenance Logs</h1>'
        + '    <span class="omni-badge">journal</span>'
        + '  </div>'
        + '  <div class="omni-toolbar">'
        + '    <div class="omni-tb-field omni-search-wrap" style="flex:1;">'
        + '      <label>Recherche</label>'
        + '      <div class="omni-search-wrap">'
        + '        <span class="omni-ic">&#128269;</span>'
        + '        <input type="text" id="omni-q" autocomplete="off"'
        + '               placeholder="ID, auteur, service, kpi, entity, commentaire, action…"/>'
        + '        <button class="omni-clear" id="omni-q-clear" title="Effacer">&times;</button>'
        + '      </div>'
        + '    </div>'
        + '    <div class="omni-tb-field"><label>Action</label>'
        + '      <div class="omni-chips" id="omni-action">'
        + '        <div class="omni-chip is-active" data-v="all">Toutes</div>'
        + '        <div class="omni-chip" data-v="add">Ajout</div>'
        + '        <div class="omni-chip" data-v="update">Modif.</div>'
        + '        <div class="omni-chip" data-v="delete">Suppr.</div>'
        + '      </div></div>'
        + '    <div class="omni-tb-field"><label>Type</label>'
        + '      <div class="omni-chips" id="omni-cat">'
        + '        <div class="omni-chip is-active" data-v="all">Tous</div>'
        + '        <div class="omni-chip" data-v="itsi">ITSI</div>'
        + '        <div class="omni-chip" data-v="custom">Custom</div>'
        + '      </div></div>'
        + '    <div class="omni-tb-field"><label>Tri</label>'
        + '      <select class="omni-select" id="omni-sort">'
        + '        <option value="date">Date (recent)</option>'
        + '        <option value="id">ID</option>'
        + '        <option value="author">Auteur</option>'
        + '        <option value="action">Action</option>'
        + '      </select></div>'
        + '    <div class="omni-tb-field"><label>&nbsp;</label>'
        + '      <button class="omni-iconbtn" id="omni-refresh" title="Rafraichir">&#8635;</button></div>'
        + '    <div class="omni-tb-field"><label>&nbsp;</label>'
        + '      <button class="omni-iconbtn" id="omni-help" title="Aide">?</button></div>'
        + (Config.debug
            ? '    <div class="omni-tb-field"><label>&nbsp;</label>'
              + '      <button class="omni-iconbtn" id="omni-debug" title="Debug : requetes SPL &amp; etat">&#128027;</button></div>'
            : '')
        + '  </div>'
        + '  <div class="omni-meta">'
        + '    <div class="omni-count" id="omni-count"></div>'
        + '    <div class="omni-legend">'
        + '      <span><span class="dot add"></span>Ajout</span>'
        + '      <span><span class="dot update"></span>Modification</span>'
        + '      <span><span class="dot delete"></span>Suppression</span>'
        + '    </div>'
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
      $('#omni_maintenance_logs_app').html(html);
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

    periods: function (json) {
      var arr = [];
      try { arr = JSON.parse(json) || []; } catch (e) { arr = []; }
      if (!arr.length) return '<i>Aucune periode definie.</i>';
      var rows = arr.map(function (p) {
        var type = DT_TYPE_FR[p.dt_type] || p.dt_type || '';
        return '<tr class="dt_period"><td><b>' + Util.esc(p.id || '') + '</b></td><td colspan="5"><hr/></td></tr>'
          + '<tr class="dt_period">'
          + '<td><b>Type:</b></td><td><span class="tag_dt">' + Util.esc(type) + '</span></td>'
          + '<td><b>Debut:</b></td><td><span class="tag_dt">' + Util.esc((p.begin_date || '') + ' ' + (p.begin_time || '')) + '</span></td>'
          + '<td><b>Fin:</b></td><td><span class="tag_dt">' + Util.esc((p.end_date || '') + ' ' + (p.end_time || '')) + '</span></td>'
          + '</tr>';
      }).join('');
      return '<table width="100%">' + rows + '</table>';
    },

    card: function (m, terms) {
      var action = String(m.action || '').toLowerCase();
      var actBadge = '<span class="dt-action-badge dt-action-' + (action || 'update') + '">'
        + Util.esc(ACTION_FR[action] || action || '?') + '</span>';
      var catBadge = m.category === 'CUSTOM'
        ? '<span class="dt-type-badge dt-type-custom">CUSTOM</span>'
        : '<span class="dt-type-badge dt-type-itsi">ITSI</span>';

      var modifyHref = (m.category === 'CUSTOM'
        ? './itsi__maintenance?mode=update_custom&dt_id=' + Util.enc(m.ID)
        : './itsi__maintenance?mode=update&dt_id=' + Util.enc(m.ID))
        + '&selected_version=' + Util.enc(m.version);
      var targetHref = './itsi__maintenance_target?form.DT_ID=' + Util.enc(m.ID);
      var deleteHref = './itsi__maintenance?mode=delete&dt_id=' + Util.enc(m.ID);
      var media = '/static/app/' + Config.appPath + '/media/';

      var filterBlock = (m.dt_filter)
        ? '<span class="fieldlist">Custom filter(s) : </span>' + Render.tags(m.dt_filter, terms) + '<br>'
        : '';
      var policyBlock = '<span class="fieldlist">policy(s) : </span>' + Render.tags(m.dt_policy, terms) + '<br>';

      return ''
        + '<div class="row-search">'
        + '  <div class="col-search">'
        + '    <div class="title-search">' + actBadge + ' ' + catBadge + ' ID [ ' + Util.hl(Util.esc(m.ID), terms) + ' ]'
        + '      <span class="tag-search-li"><b class="search-bold">Version:</b> ' + Util.esc(m.version) + '</span>'
        + '      <span class="tag-search-li"><b class="search-bold">Auteur:</b> ' + Util.hl(Util.esc(m.creator), terms) + '</span>'
        + '      <span class="tag-search-li"><b class="search-bold">Date:</b> ' + Util.esc(m.last_update) + '</span>'
        + '    </div>'
        + '    <span class="fieldlist">entity : </span>' + Render.tags(m.entity, terms) + '<br>'
        + '    <span class="fieldlist">kpi : </span>' + Render.tags(m.kpi, terms) + '<br>'
        + '    <span class="fieldlist">service : </span>' + Render.tags(m.service, terms) + '<br>'
        + filterBlock + policyBlock
        + '    <div class="accordion">'
        + '      <input type="checkbox" name="panel" id="omni-panel-' + Util.esc(m.ID) + '-' + Util.esc(m.version) + '"/>'
        + '      <label for="omni-panel-' + Util.esc(m.ID) + '-' + Util.esc(m.version) + '">Informations complementaires (' + (m.nbperiode || 0) + ' periode(s))</label>'
        + '      <div class="accordion__content accordion__content--small">'
        + '        <div class="accordion__body">' + Render.periods(m.downtime_json)
        + '          <blockquote class="comment-block"><b>Commentaire :</b> <span class="tag_comment">' + Util.hl(Util.esc(m.commentary || ''), terms) + '</span></blockquote>'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'
        + '  <div class="search-option">'
        + '    <div class="title-search last-col">OPTIONS</div>'
        + '    <a href="' + modifyHref + '" target="_blank" title="Modifier"><img class="img-option" src="' + media + 'browser.gif" width="68px" alt="Modifier"/></a>'
        + '    <a href="' + targetHref + '" target="_blank" title="Portee"><img class="img-option" src="' + media + 'reading-mode.gif" width="68px" alt="Portee"/></a>'
        + '    <a href="' + deleteHref + '" target="_blank" title="Supprimer"><img class="img-option" src="' + media + 'poubelle.gif" width="58px" alt="Supprimer"/></a>'
        + '  </div>'
        + '</div>';
    }
  };

  /* ============================================================
   *  APP
   * ============================================================ */
  var LogsApp = {

    init: function () {
      log('init logs : ' + Config.view + ' | rows/page=' + Config.rowsPerPage, 'etape > init');
      LogsApp.bindToolbar();
      // ID pre-selectionne via lien depuis la recherche
      if (Config.preID) {
        $('#omni-q').val(Config.preID);
        $('#omni-q-clear').show();
        Store.term = Config.preID;
      }
      LogsApp.loadData();
    },

    loadData: function () {
      var t0 = Date.now();
      SearchHub.run('logs', SPL.logs(), {
        message: 'Chargement de l\'historique…',
        count: 0,
        earliest: '0', latest: 'now',
        onResults: function (rows) {
          Store.all = rows.map(rowToObj);
          Store.loadTime = ((Date.now() - t0) / 1000).toFixed(2);
          log('lignes journal chargees : ' + Store.all.length + ' en ' + Store.loadTime + 's', 'etape > donnees recues');
          LogsApp.applyFilters();
        },
        onError: function () {
          $('#omni-results').html('<div class="omni-empty">Erreur de chargement. Verifiez les logs Splunk.</div>');
        }
      });
    },

    applyFilters: function () {
      var parsed = Util.parseQuery(Store.term);
      Store.hlTerms = parsed.hlTerms;
      Store.filtered = Store.all.filter(function (m) {
        if (Store.action !== 'all' && String(m.action).toLowerCase() !== Store.action) return false;
        if (Store.category !== 'all' && String(m.category).toLowerCase() !== Store.category) return false;
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
        // date desc (numerique sur dt_update)
        return (parseInt(b.dt_update, 10) || 0) - (parseInt(a.dt_update, 10) || 0);
      });

      Store.page = 0;
      log({ terme: Store.term, action: Store.action, type: Store.category, tri: Store.sort,
        resultats: Store.filtered.length + '/' + Store.all.length }, 'etape > applyFilters');
      LogsApp.render();
    },

    render: function () {
      var terms = Store.hlTerms || [];
      var total = Store.filtered.length;
      var per = Config.rowsPerPage;
      var start = Store.page * per;
      var slice = Store.filtered.slice(start, start + per);

      $('#omni-count').html(total
        ? total + ' evenement' + (total > 1 ? 's' : '') + ' <small>(charge en ' + Store.loadTime + 's)</small>'
        : 'Aucun resultat');

      if (!slice.length) {
        $('#omni-results').html('<div class="omni-empty">'
          + (Store.all.length ? 'Aucun evenement ne correspond a vos criteres.' : 'Aucun evenement enregistre.')
          + '</div>');
      } else {
        $('#omni-results').html(slice.map(function (m) { return Render.card(m, terms); }).join(''));
      }

      LogsApp.renderPagination();
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
        LogsApp.render();
        $('html,body').animate({ scrollTop: $('#omni-results').offset().top - 20 }, 200);
      });
    },

    bindToolbar: function () {
      var debounce;
      var doSearch = function (v) {
        Store.term = (v != null ? v : ($('#omni-q').val() || ''));
        LogsApp.applyFilters();
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

      $('#omni-action .omni-chip').on('click', function () {
        $('#omni-action .omni-chip').removeClass('is-active'); $(this).addClass('is-active');
        Store.action = $(this).attr('data-v');
        LogsApp.applyFilters();
      });

      $('#omni-cat .omni-chip').on('click', function () {
        $('#omni-cat .omni-chip').removeClass('is-active'); $(this).addClass('is-active');
        Store.category = $(this).attr('data-v');
        LogsApp.applyFilters();
      });

      $('#omni-sort').on('change', function () {
        Store.sort = this.value;
        LogsApp.applyFilters();
      });

      $('#omni-refresh').on('click', function () { LogsApp.loadData(); });

      $('#omni-help').on('click', function () {
        UI.modal('Omni Assistant', ''
          + '<h3>Journal des maintenances</h3>'
          + '<p>Chaque carte represente une <b>action</b> (ajout, modification, suppression) effectuee sur une maintenance, '
          + 'avec la version concernee et l\'auteur. Les actions <i>obsolete</i> sont masquees.</p>'
          + '<h3>Recherche</h3>'
          + '<p>Chaque mot saisi est cherche dans tous les champs (ID, auteur, service, kpi, entity, commentaire, action…). '
          + 'Plusieurs mots = <b>ET</b>. Jokers <code>*</code> et <code>?</code> acceptes.</p>'
          + '<h3>Filtres</h3>'
          + '<p><b>Action</b>, <b>Type</b> (ITSI/Custom) et <b>Tri</b> s\'appliquent instantanement.</p>');
      });

      $('#omni-debug').on('click', LogsApp.showDebug);
    },

    showDebug: function () {
      var q = Store.lastQueries || {};
      var section = function (titre, spl) {
        return '<div class="omni-dbg-h">' + titre + '</div><div class="omni-dbg">'
          + Util.esc(spl || '(non executee)') + '</div>';
      };
      var etat = {
        view: Config.view, rowsPerPage: Config.rowsPerPage,
        chargees: Store.all.length, affichees: Store.filtered.length,
        terme: Store.term, action: Store.action, type: Store.category, tri: Store.sort,
        page: Store.page, loadTime: Store.loadTime + 's'
      };
      UI.modal('&#128027; Debug',
        section('Requete journal (donnees)', q.logs)
        + '<div class="omni-dbg-h">Etat courant</div>'
        + '<div class="omni-dbg">' + Util.esc(JSON.stringify(etat, null, 2)) + '</div>');
    }
  };

  /* ============================================================
   *  BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config detectee');
    UI.css();
    UI.shell();
    LogsApp.init();
  });

});
