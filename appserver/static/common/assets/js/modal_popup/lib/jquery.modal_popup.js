/*
	Modified version of
    A simple jQuery modal (http://github.com/kylefox/jquery-modal) 
    Version 0.9.1
	By S.berthaud for Econocom
*/
! function(o) {
    "object" == typeof module && "object" == typeof module.exports ? o(require("jquery"), window, document) : o(jQuery, window, document)
}(function(o, t, i, e) {
    var s = [],
        l = function() {
            return s.length ? s[s.length - 1] : null
        },
        n = function() {
            var o, t = !1;
            for (o = s.length - 1; o >= 0; o--) s[o].$blocker && (s[o].$blocker.toggleClass("current", !t).toggleClass("behind", t), t = !0)
        };
    o.modal_popup = function(t, i) {
        var e, n;
        if (this.$body = o("body"), this.options = o.extend({}, o.modal_popup.defaults, i), this.options.doFade = !isNaN(parseInt(this.options.fadeDuration, 10)), this.$blocker = null, this.options.closeExisting)
            for (; o.modal_popup.isActive();) o.modal_popup.close();
        if (s.push(this), t.is("a"))
            if (n = t.attr("href"), this.anchor = t, /^#/.test(n)) {
                if (this.$elm = o(n), 1 !== this.$elm.length) return null;
                this.$body.append(this.$elm), this.open()
            } else this.$elm = o("<div>"), this.$body.append(this.$elm), e = function(o, t) {
                t.elm.remove()
            }, this.showSpinner(), t.trigger(o.modal_popup.AJAX_SEND), o.get(n).done(function(i) {
                if (o.modal_popup.isActive()) {
                    t.trigger(o.modal_popup.AJAX_SUCCESS);
                    var s = l();
                    s.$elm.empty().append(i).on(o.modal_popup.CLOSE, e), s.hideSpinner(), s.open(), t.trigger(o.modal_popup.AJAX_COMPLETE)
                }
            }).fail(function() {
                t.trigger(o.modal_popup.AJAX_FAIL);
                var i = l();
                i.hideSpinner(), s.pop(), t.trigger(o.modal_popup.AJAX_COMPLETE)
            });
        else this.$elm = t, this.anchor = t, this.$body.append(this.$elm), this.open()
    }, o.modal_popup.prototype = {
        constructor: o.modal_popup,
        open: function() {
            var t = this;
            this.block(), this.anchor.blur(), this.options.doFade ? setTimeout(function() {
                t.show()
            }, this.options.fadeDuration * this.options.fadeDelay) : this.show(), o(i).off("keydown.modal_popup").on("keydown.modal_popup", function(o) {
                var t = l();
                27 === o.which && t.options.escapeClose && t.close()
            }), this.options.clickClose && this.$blocker.click(function(t) {
                t.target === this && o.modal_popup.close()
            })
        },
        close: function() {
            s.pop(), this.unblock(), this.hide(), o.modal_popup.isActive() || o(i).off("keydown.modal_popup")
        },
        block: function() {
            this.$elm.trigger(o.modal_popup.BEFORE_BLOCK, [this._ctx()]), this.$body.css("overflow", "hidden"), this.$blocker = o('<div class="' + this.options.blockerClass + ' blocker current"></div>').appendTo(this.$body), n(), this.options.doFade && this.$blocker.css("opacity", 0).animate({
                opacity: 1
            }, this.options.fadeDuration), this.$elm.trigger(o.modal_popup.BLOCK, [this._ctx()])
        },
        unblock: function(t) {
            !t && this.options.doFade ? this.$blocker.fadeOut(this.options.fadeDuration, this.unblock.bind(this, !0)) : (this.$blocker.children().appendTo(this.$body), this.$blocker.remove(), this.$blocker = null, n(), o.modal_popup.isActive() || this.$body.css("overflow", ""))
        },
        show: function() {
            this.$elm.trigger(o.modal_popup.BEFORE_OPEN, [this._ctx()]), this.options.showClose && (this.closeButton = o('<a href="#close-modal_popup" rel="modal_popup:close" class="close-modal_popup ' + this.options.closeClass + '">' + this.options.closeText + "</a>"), this.$elm.append(this.closeButton)), this.$elm.addClass(this.options.modal_popupClass).appendTo(this.$blocker), this.options.doFade ? this.$elm.css({
                opacity: 0,
                display: "inline-block"
            }).animate({
                opacity: 1
            }, this.options.fadeDuration) : this.$elm.css("display", "inline-block"), this.$elm.trigger(o.modal_popup.OPEN, [this._ctx()])
        },
        hide: function() {
            this.$elm.trigger(o.modal_popup.BEFORE_CLOSE, [this._ctx()]), this.closeButton && this.closeButton.remove();
            var t = this;
            this.options.doFade ? this.$elm.fadeOut(this.options.fadeDuration, function() {
                t.$elm.trigger(o.modal_popup.AFTER_CLOSE, [t._ctx()])
            }) : this.$elm.hide(0, function() {
                t.$elm.trigger(o.modal_popup.AFTER_CLOSE, [t._ctx()])
            }), this.$elm.trigger(o.modal_popup.CLOSE, [this._ctx()])
        },
        showSpinner: function() {
            this.options.showSpinner && (this.spinner = this.spinner || o('<div class="' + this.options.modal_popupClass + '-spinner"></div>').append(this.options.spinnerHtml), this.$body.append(this.spinner), this.spinner.show())
        },
        hideSpinner: function() {
            this.spinner && this.spinner.remove()
        },
        _ctx: function() {
            return {
                elm: this.$elm,
                $elm: this.$elm,
                $blocker: this.$blocker,
                options: this.options
            }
        }
    }, o.modal_popup.close = function(t) {
        if (o.modal_popup.isActive()) {
            t && t.preventDefault();
            var i = l();
            return i.close(), i.$elm
        }
    }, o.modal_popup.isActive = function() {
        return s.length > 0
    }, o.modal_popup.getCurrent = l, o.modal_popup.defaults = {
        closeExisting: !0,
        escapeClose: !0,
        clickClose: !0,
        closeText: "Close",
        closeClass: "",
        modal_popupClass: "modal_popup",
        blockerClass: "jquery-modal_popup",
        spinnerHtml: '<div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div>',
        showSpinner: !0,
        showClose: !0,
        fadeDuration: null,
        fadeDelay: 1
    }, o.modal_popup.BEFORE_BLOCK = "modal_popup:before-block", o.modal_popup.BLOCK = "modal_popup:block", o.modal_popup.BEFORE_OPEN = "modal_popup:before-open", o.modal_popup.OPEN = "modal_popup:open", o.modal_popup.BEFORE_CLOSE = "modal_popup:before-close", o.modal_popup.CLOSE = "modal_popup:close", o.modal_popup.AFTER_CLOSE = "modal_popup:after-close", o.modal_popup.AJAX_SEND = "modal_popup:ajax:send", o.modal_popup.AJAX_SUCCESS = "modal_popup:ajax:success", o.modal_popup.AJAX_FAIL = "modal_popup:ajax:fail", o.modal_popup.AJAX_COMPLETE = "modal_popup:ajax:complete", o.fn.modal_popup = function(t) {
        return 1 === this.length && new o.modal_popup(this, t), this
    }, o(i).on("click.modal_popup", 'a[rel~="modal_popup:close"]', o.modal_popup.close), o(i).on("click.modal_popup", 'a[rel~="modal_popup:open"]', function(t) {
        t.preventDefault(), o(this).modal_popup()
    })
});
