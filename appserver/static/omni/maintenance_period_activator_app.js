var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '1.0.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance Period Activator v' + APP_VERSION + ' charge');

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
  var LOOKUP = 'omni_kv_def';
  var MOUNT  = 'omni_maintenance_activator_app';

  function urlParam(name) {
    var safe = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp('[?&]' + safe + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  var $cfg = $('#omni_activator_config');
  var Config = {
    debug: (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1',
    // lien depuis les cartes : ?form.DT_ID=...
    dtId: urlParam('form.DT_ID') || urlParam('DT_ID') || urlParam('form.input_ID') || '',
    appPath: APP_NAME
  };

  function log(obj, titre, level) {
    if (!Config.debug) return;
    var colors = ['#fff', '#ff0', '#f00'];
    console.groupCollapsed('%c Omni-Act %s', 'color:' + (colors[level || 0]), titre || '');
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
    enc: function (s) { return encodeURIComponent(s == null ? '' : s); },
    splQuote: function (s) { return String(s == null ? '' : s).replace(/"/g, '\\"'); },
    arr: function (v) { return (v == null) ? [] : (_.isArray(v) ? v : [v]); }
  };

  var DT_TYPE_FR = {
    weekly: 'Hebdomadaire', monthly: 'Mensuel', between_date: 'Date a date',
    special_date_first_in_month: 'Premier du mois',
    special_date_second_in_month: 'Deuxieme du mois',
    special_date_third_in_month: 'Troisieme du mois',
    special_date_fourth_in_month: 'Quatrieme du mois',
    special_date_last_in_month: 'Dernier du mois',
    Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
    Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche'
  };

  /* ============================================================
   *  ETAT
   * ============================================================ */
  var Store = {
    rec: null,         // objet maintenance
    periods: [],       // [{id,dt_type,begin_date,...}]
    states: [],        // [true/false] -> true = enable
    busy: false
  };

  /* ============================================================
   *  LOADER  +  RUNNER SEARCH (simplifie)
   * ============================================================ */
  var Loader = {
    show: function (msg, pct) {
      var $l = $('#omni-loader'); if (!$l.length) return;
      $l.addClass('is-visible');
      $l.find('.omni-loader__msg-txt').text(msg || 'Chargement…');
      $l.find('.omni-loader__bar').css('width', Math.max(pct || 5, 5) + '%');
      $l.find('.omni-loader__pct').text((pct || 0) + '%');
    },
    hide: function () { $('#omni-loader').removeClass('is-visible'); }
  };

  function runSearch(spl, opts) {
    opts = opts || {};
    Loader.show(opts.message, 5);
    if (Config.debug) { try { console.log('%c SPL', 'color:#0bf;font-weight:bold', '\n' + spl); } catch (e) {} }

    var sm = new SearchManager({
      id: 'omnia_' + (opts.id || 'q') + '_' + Date.now(),
      preview: false, cache: false, autostart: true,
      search: spl, earliest_time: '0', latest_time: 'now'
    });

    sm.on('search:progress', function (p) {
      var dp = (p && p.content && typeof p.content.doneProgress === 'number') ? p.content.doneProgress : 0;
      Loader.show(opts.message, Math.round(dp * 100));
    });

    sm.on('search:done', function (p) {
      Loader.show(opts.message, 100);
      var rc = (p && p.content) ? p.content.resultCount : -1;
      if (opts.onResults && rc >= 0) {
        var rs = sm.data('results', { count: 0, output_mode: 'json_rows' });
        rs.on('data', function () {
          var d = rs.data() || {};
          var fields = (d.fields || []).map(function (f) { return (typeof f === 'string') ? f : (f && f.name) || f; });
          var rows = d.rows || [];
          Loader.hide();
          opts.onResults(rows, fields);
        });
        rs.on('error', function () { Loader.hide(); if (opts.onError) opts.onError(); });
      } else {
        Loader.hide();
        if (opts.onDone) opts.onDone(p);
      }
    });

    sm.on('search:failed search:error', function (p) {
      log(p, 'recherche en echec', 2);
      Loader.hide();
      if (opts.onError) opts.onError(p);
    });

    return sm;
  }

  function rowObj(row, fields) {
    var o = {}; for (var i = 0; i < fields.length; i++) o[fields[i]] = row[i]; return o;
  }

  /* ============================================================
   *  SPL
   * ============================================================ */
  function buildReadSpl(id) {
    return ''
      + '| inputlookup ' + LOOKUP + ' '
      + '| search ID="' + Util.splQuote(id) + '" '
      + '| head 1 '
      + '| eval entity=mvjoin(entity,";"), kpi=mvjoin(kpi,";"), service=mvjoin(service,";") '
      + '| eval dt_policy=coalesce(dt_policy,"-") '
      + '| eval last_update=strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S") '
      + '| eval category=if(coalesce(step_opt,"")=="000","CUSTOM","ITSI") '
      + '| table _key, ID, creator, last_update, version, category, step_opt, '
      + '        dt_policy, dt_filter, commentary, entity, kpi, service, downtime, status';
  }

  // ecrit UNIQUEMENT le champ status (mv), une valeur enable/disable par periode.
  // on relit la ligne complete puis on reecrit avec append=true key_field=_key
  // -> tous les autres champs sont preserves, seul status est remplace.
  function buildSaveSpl(id, states) {
    var vals = states.map(function (on) { return on ? 'enable' : 'disable'; }).join(',');
    return ''
      + '| inputlookup ' + LOOKUP + ' '
      + '| search ID="' + Util.splQuote(id) + '" '
      + '| head 1 '
      + '| eval status=split("' + vals + '", ",") '
      + '| outputlookup append=true key_field=_key ' + LOOKUP;
  }

  /* ============================================================
   *  UI  (shell + css)
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-act-style').length) return;
      var M = '#' + MOUNT;
      var c = [
        ':root{--omni-primary:#23579d;--omni-primary-2:#1d3f73;--omni-accent:#fcb040;--omni-ok:#00cec9;--omni-err:#ff7675;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        M + '{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:900px;margin:0 auto;}',
        M + ' *{box-sizing:border-box;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:19px;margin:0;font-weight:600;letter-spacing:.3px;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        '.omni-summary{padding:18px 24px;border-bottom:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-summary .row{margin:4px 0;font-size:13.5px;}',
        '.fieldlist{font-size:12.5px;color:var(--omni-muted);font-weight:600;margin-right:4px;}',
        '.dt-type-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}',
        '.dt-type-itsi{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}',
        '.dt-type-custom{background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);}',
        '.tag{font-family:Roboto,sans-serif;font-size:12px;background:var(--omni-primary);border-radius:4px;color:#fff;display:inline-block;margin:3px 3px 3px 0!important;padding:3px 8px!important;}',
        '.tag_dt{font-family:Roboto,sans-serif;font-size:11.5px;background:#74b9ff;border-radius:4px;color:#fff;display:inline-block;margin:2px 2px 2px 0!important;padding:2px 7px!important;}',
        '.comment-block{background:#f1f4f8;border-left:3px solid var(--omni-accent);padding:8px 10px;margin:8px 0 0;font-size:12.5px;border-radius:0 6px 6px 0;}',
        /* periodes */
        '.omni-periods{padding:16px 24px;}',
        '.omni-periods h3{margin:0 0 6px;font-size:14px;color:var(--omni-primary);}',
        '.omni-bulk{display:flex;gap:10px;margin:6px 0 14px;}',
        '.omni-bulk a{font-size:12.5px;color:var(--omni-primary);cursor:pointer;text-decoration:none;font-weight:600;}',
        '.omni-bulk a:hover{text-decoration:underline;}',
        '.omni-period{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--omni-line);border-radius:10px;margin:10px 0;background:#fff;transition:.15s;}',
        '.omni-period.is-off{opacity:.62;background:#fafbfc;}',
        '.omni-period__info{flex:1;min-width:0;}',
        '.omni-period__info .ttl{font-size:13.5px;}',
        '.omni-period__dates{font-size:12px;color:var(--omni-muted);margin-top:4px;}',
        '.omni-period__state{width:104px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.4px;border-radius:999px;padding:5px 0;}',
        '.omni-period__state.on{background:rgba(0,206,201,.15);color:#0a8f8b;}',
        '.omni-period__state.off{background:rgba(255,118,117,.15);color:#c0392b;}',
        /* switch */
        '.omni-switch{position:relative;display:inline-block;width:48px;height:26px;flex:0 0 auto;}',
        '.omni-switch input{display:none;}',
        '.omni-switch .slider{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;transition:.2s;cursor:pointer;}',
        '.omni-switch .slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.3);}',
        '.omni-switch input:checked + .slider{background:var(--omni-ok);}',
        '.omni-switch input:checked + .slider:before{transform:translateX(22px);}',
        /* barre d action */
        '.omni-actbar{display:flex;gap:12px;align-items:center;padding:16px 24px;border-top:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-actbar .recap{font-size:13px;color:var(--omni-muted);margin-right:auto;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;display:inline-flex;align-items:center;gap:6px;}',
        '.omni-btn--primary:hover{background:var(--omni-primary-2);}',
        '.omni-btn--primary[disabled]{opacity:.5;cursor:not-allowed;}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--ghost:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        '.omni-empty{text-align:center;color:var(--omni-muted);padding:48px 12px;font-size:15px;}',
        /* loader */
        '.omni-loader{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#0f2238;color:#fff;border-radius:12px;padding:14px 22px;min-width:280px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:.2s;z-index:9999;}',
        '.omni-loader.is-visible{opacity:1;}',
        '.omni-loader__msg{font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;}',
        '.omni-loader__track{height:8px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;}',
        '.omni-loader__bar{height:100%;width:5%;background:linear-gradient(90deg,var(--omni-accent),#ffd27a);border-radius:999px;transition:width .25s;}',
        /* modal */
        '.omni-modal{position:fixed;inset:0;background:rgba(15,34,56,.55);display:none;align-items:center;justify-content:center;z-index:10000;}',
        '.omni-modal.is-open{display:flex;}',
        '.omni-modal__box{background:#fff;border-radius:14px;width:min(520px,92vw);overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}',
        '.omni-modal__head{padding:16px 22px;background:var(--omni-primary);color:#fff;font-weight:600;}',
        '.omni-modal__head.is-err{background:var(--omni-err);}.omni-modal__head.is-ok{background:var(--omni-ok);}',
        '.omni-modal__body{padding:20px 22px;font-size:14px;line-height:1.55;}',
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}'
      ];
      $('<style id="omni-act-style">').text(c.join('\n')).appendTo('head');
    },

    shell: function () {
      var html = ''
        + '<a class="omni-back" href="./itsi__maintenance_search">&#8592; Retour a la recherche</a>'
        + '<div class="omni-card">'
        + '  <div class="omni-header">'
        + '    <img src="/static/app/' + Config.appPath + '/media/logo_omni.png" style="height:30px" onerror="this.style.display=\'none\'"/>'
        + '    <h1>Activation des periodes</h1>'
        + '    <span class="omni-badge">downtime</span>'
        + '  </div>'
        + '  <div id="omni-summary" class="omni-summary"></div>'
        + '  <div id="omni-periods" class="omni-periods"></div>'
        + '  <div id="omni-actbar" class="omni-actbar" style="display:none">'
        + '    <span class="recap" id="omni-recap"></span>'
        + '    <button class="omni-btn omni-btn--ghost" id="omni-reset">Annuler</button>'
        + '    <button class="omni-btn omni-btn--primary" id="omni-save">&#128190; Enregistrer</button>'
        + '  </div>'
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

      $('#' + MOUNT).html(html);
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
   *  RENDU
   * ============================================================ */
  var Render = {
    tags: function (val) {
      if (val == null || val === '') return '<span class="fieldlist">-</span>';
      if (val === '*') return '<span class="tag">Tous</span>';
      return String(val).split(';').map(function (x) {
        x = x.trim(); if (!x) return '';
        return '<span class="tag">' + Util.esc(x) + '</span>';
      }).join('');
    },

    summary: function (m) {
      var badge = m.category === 'CUSTOM'
        ? '<span class="dt-type-badge dt-type-custom">CUSTOM</span>'
        : '<span class="dt-type-badge dt-type-itsi">ITSI</span>';
      var html = ''
        + '<div class="row" style="font-size:16px;font-weight:600;color:var(--omni-primary);margin-bottom:8px;">'
        + badge + ' &nbsp;ID [ ' + Util.esc(m.ID) + ' ]'
        + '   <span style="font-size:12px;color:var(--omni-muted);font-weight:400;margin-left:8px;">v' + Util.esc(m.version) + '</span></div>'
        + '<div class="row"><span class="fieldlist">Auteur :</span> ' + Util.esc(m.creator) + ' &nbsp; '
        + '<span class="fieldlist">Derniere MAJ :</span> ' + Util.esc(m.last_update) + '</div>'
        + '<div class="row"><span class="fieldlist">entity :</span> ' + Render.tags(m.entity) + '</div>'
        + '<div class="row"><span class="fieldlist">kpi :</span> ' + Render.tags(m.kpi) + '</div>'
        + '<div class="row"><span class="fieldlist">service :</span> ' + Render.tags(m.service) + '</div>'
        + '<div class="row"><span class="fieldlist">policy(s) :</span> ' + Render.tags(m.dt_policy) + '</div>'
        + (m.dt_filter ? '<div class="row"><span class="fieldlist">Custom filter(s) :</span> ' + Render.tags(m.dt_filter) + '</div>' : '')
        + (m.commentary ? '<div class="comment-block"><b>Commentaire :</b> ' + Util.esc(m.commentary) + '</div>' : '');
      $('#omni-summary').html(html);
    },

    period: function (p, idx, on) {
      var type  = DT_TYPE_FR[p.dt_type] || p.dt_type || '—';
      var day   = DT_TYPE_FR[p.day] || p.day || '';
      var begin = ((p.begin_date || '') + ' ' + (p.begin_time || '')).trim() || '—';
      var end   = ((p.end_date || '') + ' ' + (p.end_time || '')).trim() || '—';
      return ''
        + '<div class="omni-period ' + (on ? '' : 'is-off') + '" id="omni-period-' + idx + '">'
        + '  <label class="omni-switch"><input type="checkbox" class="omni-tgl" data-i="' + idx + '" ' + (on ? 'checked' : '') + '/><span class="slider"></span></label>'
        + '  <div class="omni-period__info">'
        + '    <div class="ttl"><b>' + Util.esc(p.id || ('Periode ' + (idx + 1))) + '</b> '
        + '         <span class="tag_dt">' + Util.esc(type) + '</span>'
        + (day ? ' <span class="tag_dt">' + Util.esc(day) + '</span>' : '') + '</div>'
        + '    <div class="omni-period__dates"><b>Debut :</b> ' + Util.esc(begin) + ' &nbsp;&nbsp; <b>Fin :</b> ' + Util.esc(end) + '</div>'
        + '  </div>'
        + '  <div class="omni-period__state ' + (on ? 'on' : 'off') + '" data-i="' + idx + '">' + (on ? 'ACTIVE' : 'DESACTIVEE') + '</div>'
        + '</div>';
    },

    periods: function () {
      if (!Store.periods.length) {
        $('#omni-periods').html('<div class="omni-empty">Aucune periode definie pour cette maintenance.</div>');
        $('#omni-actbar').hide();
        return;
      }
      var html = '<h3>Periodes (' + Store.periods.length + ')</h3>'
        + '<div class="omni-bulk"><a id="omni-all-on">Tout activer</a><a id="omni-all-off">Tout desactiver</a></div>';
      html += Store.periods.map(function (p, i) { return Render.period(p, i, Store.states[i]); }).join('');
      $('#omni-periods').html(html);
      $('#omni-actbar').show();
      Render.recap();
    },

    recap: function () {
      var on = Store.states.filter(function (s) { return s; }).length;
      var off = Store.states.length - on;
      $('#omni-recap').text(on + ' active(s) / ' + off + ' desactivee(s)');
    },

    refreshRow: function (idx) {
      var on = Store.states[idx];
      var $row = $('#omni-period-' + idx);
      $row.toggleClass('is-off', !on);
      $row.find('.omni-period__state')
        .attr('class', 'omni-period__state ' + (on ? 'on' : 'off'))
        .text(on ? 'ACTIVE' : 'DESACTIVEE');
      Render.recap();
    }
  };

  /* ============================================================
   *  APP
   * ============================================================ */
  var App = {
    init: function () {
      if (!Config.dtId) {
        $('#omni-summary').html('<div class="omni-empty">Aucun identifiant de maintenance (DT_ID) fourni.</div>');
        return;
      }
      App.bind();
      App.load();
    },

    load: function () {
      runSearch(buildReadSpl(Config.dtId), {
        id: 'read',
        message: 'Chargement de la maintenance…',
        onResults: function (rows, fields) {
          if (!rows.length) {
            $('#omni-summary').html('<div class="omni-empty">Maintenance introuvable : ' + Util.esc(Config.dtId) + '</div>');
            return;
          }
          var m = rowObj(rows[0], fields);
          Store.rec = m;

          // downtime : mv de chaines JSON -> objets
          Store.periods = Util.arr(m.downtime).map(function (s) {
            try { return JSON.parse(s); } catch (e) { return {}; }
          });

          // status : mv enable/disable (par defaut enable si absent)
          var st = Util.arr(m.status);
          Store.states = Store.periods.map(function (p, i) {
            return String(st[i] || 'enable').toLowerCase() !== 'disable';
          });

          log({ periodes: Store.periods.length, states: Store.states }, 'donnees lues');
          Render.summary(m);
          Render.periods();
        },
        onError: function () {
          $('#omni-summary').html('<div class="omni-empty">Erreur de chargement. Verifiez les logs Splunk.</div>');
        }
      });
    },

    bind: function () {
      // toggles (delegation)
      $('#omni-periods').on('change', '.omni-tgl', function () {
        var i = parseInt($(this).attr('data-i'), 10);
        Store.states[i] = this.checked;
        Render.refreshRow(i);
      });

      // tout activer / desactiver
      $('#omni-periods').on('click', '#omni-all-on', function () {
        Store.states = Store.states.map(function () { return true; });
        Render.periods();
      });
      $('#omni-periods').on('click', '#omni-all-off', function () {
        Store.states = Store.states.map(function () { return false; });
        Render.periods();
      });

      $('#omni-reset').on('click', function () { App.load(); });
      $('#omni-save').on('click', App.save);
    },

    save: function () {
      if (Store.busy || !Store.periods.length) return;
      Store.busy = true;
      $('#omni-save').attr('disabled', 'disabled');

      runSearch(buildSaveSpl(Config.dtId, Store.states), {
        id: 'save',
        message: 'Enregistrement…',
        onDone: function () {
          Store.busy = false;
          $('#omni-save').removeAttr('disabled');
          var on = Store.states.filter(function (s) { return s; }).length;
          var off = Store.states.length - on;
          UI.modal('&#10004; Enregistre',
            '<p>Le statut des periodes a ete mis a jour pour la maintenance <b>' + Util.esc(Config.dtId) + '</b>.</p>'
            + '<p>' + on + ' periode(s) active(s), ' + off + ' desactivee(s).</p>', 'ok');
          App.load(); // relit l etat persiste
        },
        onError: function () {
          Store.busy = false;
          $('#omni-save').removeAttr('disabled');
          UI.modal('&#10006; Erreur',
            '<p>L\'enregistrement a echoue. Verifiez vos droits d\'ecriture sur le lookup '
            + '<code>' + LOOKUP + '</code> et les logs Splunk.</p>', 'err');
        }
      });
    }
  };

  /* ============================================================
   *  BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config activator');
    UI.css();
    UI.shell();
    App.init();
  });

});
