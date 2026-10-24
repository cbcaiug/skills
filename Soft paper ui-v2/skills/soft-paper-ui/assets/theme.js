/* SOFT PAPER UI runtime. No dependencies. Works with plain HTML, React, Vue, anything.
   Switch:   SoftPaper.enable() / disable() / toggle() / setColor('light'|'dark'|'system')
   Feedback: toast(msg,{type,action,onAction,duration}) · alert/confirm/prompt/modal -> Promise · sheet · menu · loading · offlineBanner
   Motion:   transition(fn) · tabs(el) · segmented(el) · bump(el) · asyncButton(btn, fn, opts) · status(el).set(state, copy)
   Layout:   sidebar({toggle, shell}) · icon(name) · mountIcons()
   Auto:     data-icon · data-tip · data-sp-clear · data-sp-password · data-sp-autogrow · data-sp-counter */
(function (global) {
  "use strict";
  var KEY = "sp-enabled", CKEY = "sp-color", root = document.documentElement;
  var SPRITE = "<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\" aria-hidden=\"true\"><symbol id=\"sp-i-menu\" viewBox=\"0 0 24 24\"><path d=\"M4 5h16\" /> <path d=\"M4 12h16\" /> <path d=\"M4 19h16\" /></symbol><symbol id=\"sp-i-x\" viewBox=\"0 0 24 24\"><path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" /></symbol><symbol id=\"sp-i-panel-left\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" /></symbol><symbol id=\"sp-i-panel-left-open\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" /> <path d=\"m14 9 3 3-3 3\" /></symbol><symbol id=\"sp-i-panel-left-close\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M9 3v18\" /> <path d=\"m16 15-3-3 3-3\" /></symbol><symbol id=\"sp-i-panel-right\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /> <path d=\"M15 3v18\" /></symbol><symbol id=\"sp-i-chevron-left\" viewBox=\"0 0 24 24\"><path d=\"m15 18-6-6 6-6\" /></symbol><symbol id=\"sp-i-chevron-right\" viewBox=\"0 0 24 24\"><path d=\"m9 18 6-6-6-6\" /></symbol><symbol id=\"sp-i-chevron-up\" viewBox=\"0 0 24 24\"><path d=\"m18 15-6-6-6 6\" /></symbol><symbol id=\"sp-i-chevron-down\" viewBox=\"0 0 24 24\"><path d=\"m6 9 6 6 6-6\" /></symbol><symbol id=\"sp-i-chevrons-up-down\" viewBox=\"0 0 24 24\"><path d=\"m7 15 5 5 5-5\" /> <path d=\"m7 9 5-5 5 5\" /></symbol><symbol id=\"sp-i-arrow-left\" viewBox=\"0 0 24 24\"><path d=\"m12 19-7-7 7-7\" /> <path d=\"M19 12H5\" /></symbol><symbol id=\"sp-i-arrow-right\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\" /> <path d=\"m12 5 7 7-7 7\" /></symbol><symbol id=\"sp-i-arrow-up\" viewBox=\"0 0 24 24\"><path d=\"m5 12 7-7 7 7\" /> <path d=\"M12 19V5\" /></symbol><symbol id=\"sp-i-arrow-down\" viewBox=\"0 0 24 24\"><path d=\"M12 5v14\" /> <path d=\"m19 12-7 7-7-7\" /></symbol><symbol id=\"sp-i-search\" viewBox=\"0 0 24 24\"><path d=\"m21 21-4.34-4.34\" /> <circle cx=\"11\" cy=\"11\" r=\"8\" /></symbol><symbol id=\"sp-i-plus\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\" /> <path d=\"M12 5v14\" /></symbol><symbol id=\"sp-i-minus\" viewBox=\"0 0 24 24\"><path d=\"M5 12h14\" /></symbol><symbol id=\"sp-i-check\" viewBox=\"0 0 24 24\"><path d=\"M20 6 9 17l-5-5\" /></symbol><symbol id=\"sp-i-trash-2\" viewBox=\"0 0 24 24\"><path d=\"M10 11v6\" /> <path d=\"M14 11v6\" /> <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /> <path d=\"M3 6h18\" /> <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" /></symbol><symbol id=\"sp-i-pencil\" viewBox=\"0 0 24 24\"><path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /> <path d=\"m15 5 4 4\" /></symbol><symbol id=\"sp-i-settings\" viewBox=\"0 0 24 24\"><path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" /></symbol><symbol id=\"sp-i-user\" viewBox=\"0 0 24 24\"><path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /> <circle cx=\"12\" cy=\"7\" r=\"4\" /></symbol><symbol id=\"sp-i-users\" viewBox=\"0 0 24 24\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /> <path d=\"M16 3.128a4 4 0 0 1 0 7.744\" /> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\" /> <circle cx=\"9\" cy=\"7\" r=\"4\" /></symbol><symbol id=\"sp-i-house\" viewBox=\"0 0 24 24\"><path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /> <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" /></symbol><symbol id=\"sp-i-download\" viewBox=\"0 0 24 24\"><path d=\"M12 15V3\" /> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /> <path d=\"m7 10 5 5 5-5\" /></symbol><symbol id=\"sp-i-upload\" viewBox=\"0 0 24 24\"><path d=\"M12 3v12\" /> <path d=\"m17 8-5-5-5 5\" /> <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /></symbol><symbol id=\"sp-i-share-2\" viewBox=\"0 0 24 24\"><circle cx=\"18\" cy=\"5\" r=\"3\" /> <circle cx=\"6\" cy=\"12\" r=\"3\" /> <circle cx=\"18\" cy=\"19\" r=\"3\" /> <line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\" /> <line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\" /></symbol><symbol id=\"sp-i-copy\" viewBox=\"0 0 24 24\"><rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /> <path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" /></symbol><symbol id=\"sp-i-bell\" viewBox=\"0 0 24 24\"><path d=\"M10.268 21a2 2 0 0 0 3.464 0\" /> <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" /></symbol><symbol id=\"sp-i-funnel\" viewBox=\"0 0 24 24\"><path d=\"M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z\" /></symbol><symbol id=\"sp-i-eye\" viewBox=\"0 0 24 24\"><path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" /></symbol><symbol id=\"sp-i-eye-off\" viewBox=\"0 0 24 24\"><path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /> <path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /> <path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /> <path d=\"m2 2 20 20\" /></symbol><symbol id=\"sp-i-info\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 16v-4\" /> <path d=\"M12 8h.01\" /></symbol><symbol id=\"sp-i-triangle-alert\" viewBox=\"0 0 24 24\"><path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /> <path d=\"M12 9v4\" /> <path d=\"M12 17h.01\" /></symbol><symbol id=\"sp-i-circle-alert\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <line x1=\"12\" x2=\"12\" y1=\"8\" y2=\"12\" /> <line x1=\"12\" x2=\"12.01\" y1=\"16\" y2=\"16\" /></symbol><symbol id=\"sp-i-circle-check\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m16 9-5.5 5.5L8 12\" /></symbol><symbol id=\"sp-i-circle-x\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"m15 9-6 6\" /> <path d=\"m9 9 6 6\" /></symbol><symbol id=\"sp-i-ellipsis\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"1\" /> <circle cx=\"19\" cy=\"12\" r=\"1\" /> <circle cx=\"5\" cy=\"12\" r=\"1\" /></symbol><symbol id=\"sp-i-ellipsis-vertical\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"1\" /> <circle cx=\"12\" cy=\"5\" r=\"1\" /> <circle cx=\"12\" cy=\"19\" r=\"1\" /></symbol><symbol id=\"sp-i-send\" viewBox=\"0 0 24 24\"><path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /> <path d=\"m21.854 2.147-10.94 10.939\" /></symbol><symbol id=\"sp-i-mic\" viewBox=\"0 0 24 24\"><path d=\"M12 19v3\" /> <path d=\"M19 10v2a7 7 0 0 1-14 0v-2\" /> <rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\" /></symbol><symbol id=\"sp-i-paperclip\" viewBox=\"0 0 24 24\"><path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\" /></symbol><symbol id=\"sp-i-sun\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"4\" /> <path d=\"M12 2v2\" /> <path d=\"M12 20v2\" /> <path d=\"m4.93 4.93 1.41 1.41\" /> <path d=\"m17.66 17.66 1.41 1.41\" /> <path d=\"M2 12h2\" /> <path d=\"M20 12h2\" /> <path d=\"m6.34 17.66-1.41 1.41\" /> <path d=\"m19.07 4.93-1.41 1.41\" /></symbol><symbol id=\"sp-i-moon\" viewBox=\"0 0 24 24\"><path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" /></symbol><symbol id=\"sp-i-log-out\" viewBox=\"0 0 24 24\"><path d=\"m16 17 5-5-5-5\" /> <path d=\"M21 12H9\" /> <path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" /></symbol><symbol id=\"sp-i-log-in\" viewBox=\"0 0 24 24\"><path d=\"m10 17 5-5-5-5\" /> <path d=\"M15 12H3\" /> <path d=\"M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4\" /></symbol><symbol id=\"sp-i-external-link\" viewBox=\"0 0 24 24\"><path d=\"M15 3h6v6\" /> <path d=\"M10 14 21 3\" /> <path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" /></symbol><symbol id=\"sp-i-refresh-cw\" viewBox=\"0 0 24 24\"><path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" /> <path d=\"M21 3v5h-5\" /> <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" /> <path d=\"M8 16H3v5\" /></symbol><symbol id=\"sp-i-star\" viewBox=\"0 0 24 24\"><path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" /></symbol><symbol id=\"sp-i-heart\" viewBox=\"0 0 24 24\"><path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" /></symbol><symbol id=\"sp-i-bookmark\" viewBox=\"0 0 24 24\"><path d=\"M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z\" /></symbol><symbol id=\"sp-i-lock\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" /></symbol><symbol id=\"sp-i-mail\" viewBox=\"0 0 24 24\"><path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\" /> <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" /></symbol><symbol id=\"sp-i-phone\" viewBox=\"0 0 24 24\"><path d=\"M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384\" /></symbol><symbol id=\"sp-i-calendar\" viewBox=\"0 0 24 24\"><path d=\"M8 2v3\" /> <path d=\"M16 2v3\" /> <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" /> <path d=\"M3 9h18\" /></symbol><symbol id=\"sp-i-clock\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 6v6l4 2\" /></symbol><symbol id=\"sp-i-file-text\" viewBox=\"0 0 24 24\"><path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" /> <path d=\"M14 2v5a1 1 0 0 0 1 1h5\" /> <path d=\"M10 9H8\" /> <path d=\"M16 13H8\" /> <path d=\"M16 17H8\" /></symbol><symbol id=\"sp-i-folder\" viewBox=\"0 0 24 24\"><path d=\"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z\" /></symbol><symbol id=\"sp-i-image\" viewBox=\"0 0 24 24\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /> <circle cx=\"9\" cy=\"9\" r=\"2\" /> <path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" /></symbol><symbol id=\"sp-i-camera\" viewBox=\"0 0 24 24\"><path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" /> <circle cx=\"12\" cy=\"13\" r=\"3\" /></symbol><symbol id=\"sp-i-shopping-cart\" viewBox=\"0 0 24 24\"><path d=\"m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18\" /> <path d=\"M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25\" /> <circle cx=\"18\" cy=\"20\" r=\"2\" /> <circle cx=\"8\" cy=\"20\" r=\"2\" /></symbol><symbol id=\"sp-i-credit-card\" viewBox=\"0 0 24 24\"><rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\" /> <line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\" /> <path d=\"M6 14h2\" /></symbol><symbol id=\"sp-i-wifi-off\" viewBox=\"0 0 24 24\"><path d=\"M12 20h.01\" /> <path d=\"M8.5 16.429a5 5 0 0 1 7 0\" /> <path d=\"M5 12.859a10 10 0 0 1 5.17-2.69\" /> <path d=\"M19 12.859a10 10 0 0 0-2.007-1.523\" /> <path d=\"M2 8.82a15 15 0 0 1 4.177-2.643\" /> <path d=\"M22 8.82a15 15 0 0 0-11.288-3.764\" /> <path d=\"m2 2 20 20\" /></symbol><symbol id=\"sp-i-loader-circle\" viewBox=\"0 0 24 24\"><path d=\"M21 12a9 9 0 1 1-6.219-8.56\" /></symbol><symbol id=\"sp-i-sliders-horizontal\" viewBox=\"0 0 24 24\"><path d=\"M10 5H3\" /> <path d=\"M12 19H3\" /> <path d=\"M14 3v4\" /> <path d=\"M16 17v4\" /> <path d=\"M21 12h-9\" /> <path d=\"M21 19h-5\" /> <path d=\"M21 5h-7\" /> <path d=\"M8 10v4\" /> <path d=\"M8 12H3\" /></symbol><symbol id=\"sp-i-layout-grid\" viewBox=\"0 0 24 24\"><rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\" /> <rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\" /></symbol><symbol id=\"sp-i-list\" viewBox=\"0 0 24 24\"><path d=\"M3 5h.01\" /> <path d=\"M3 12h.01\" /> <path d=\"M3 19h.01\" /> <path d=\"M8 5h13\" /> <path d=\"M8 12h13\" /> <path d=\"M8 19h13\" /></symbol><symbol id=\"sp-i-book-open\" viewBox=\"0 0 24 24\"><path d=\"M12 5v16\" /> <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" /></symbol><symbol id=\"sp-i-graduation-cap\" viewBox=\"0 0 24 24\"><path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /> <path d=\"M22 10v6\" /> <path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" /></symbol><symbol id=\"sp-i-circle-help\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /> <path d=\"M12 17h.01\" /></symbol><symbol id=\"sp-i-message-square\" viewBox=\"0 0 24 24\"><path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\" /></symbol><symbol id=\"sp-i-save\" viewBox=\"0 0 24 24\"><path d=\"M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z\" /> <path d=\"M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7\" /> <path d=\"M7 3v4a1 1 0 0 0 1 1h7\" /></symbol><symbol id=\"sp-i-undo-2\" viewBox=\"0 0 24 24\"><path d=\"M9 14 4 9l5-5\" /> <path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\" /></symbol><symbol id=\"sp-i-link\" viewBox=\"0 0 24 24\"><path d=\"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71\" /> <path d=\"M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71\" /></symbol><symbol id=\"sp-i-sparkles\" viewBox=\"0 0 24 24\"><path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /> <path d=\"M20 2v4\" /> <path d=\"M22 4h-4\" /> <circle cx=\"4\" cy=\"20\" r=\"2\" /></symbol><symbol id=\"sp-i-ghost\" viewBox=\"0 0 24 24\"><path d=\"M15 10v1\" /> <path d=\"M7.528 20.472a1.6 1.6 0 012.277 0l1.057 1.056a1.6 1.6 0 002.276 0l1.057-1.056a1.6 1.6 0 012.277 0l1.114 1.114a1.4 1.4 0 002.414-1V10a8 8 0 00-16 0v10.586a1.4 1.4 0 002.414 1z\" /> <path d=\"M9 10v1\" /></symbol><symbol id=\"sp-i-circle-plus\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M8 12h8\" /> <path d=\"M12 8v8\" /></symbol><symbol id=\"sp-i-layout-dashboard\" viewBox=\"0 0 24 24\"><rect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\" /> <rect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\" /> <rect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\" /></symbol><symbol id=\"sp-i-chart-column\" viewBox=\"0 0 24 24\"><path d=\"M3 3v16a2 2 0 0 0 2 2h16\" /> <path d=\"M18 17V9\" /> <path d=\"M13 17V5\" /> <path d=\"M8 17v-3\" /></symbol><symbol id=\"sp-i-clipboard-list\" viewBox=\"0 0 24 24\"><rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /> <path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /> <path d=\"M12 11h4\" /> <path d=\"M12 16h4\" /> <path d=\"M8 11h.01\" /> <path d=\"M8 16h.01\" /></symbol><symbol id=\"sp-i-school\" viewBox=\"0 0 24 24\"><path d=\"M14 21v-3a2 2 0 0 0-4 0v3\" /> <path d=\"M18 4.933V21\" /> <path d=\"m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6\" /> <path d=\"m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11\" /> <path d=\"M6 4.933V21\" /> <circle cx=\"12\" cy=\"9\" r=\"2\" /></symbol><symbol id=\"sp-i-notebook-pen\" viewBox=\"0 0 24 24\"><path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" /> <path d=\"M2 6h4\" /> <path d=\"M2 10h4\" /> <path d=\"M2 14h4\" /> <path d=\"M2 18h4\" /> <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\" /></symbol><symbol id=\"sp-i-wallet\" viewBox=\"0 0 24 24\"><path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /> <path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" /></symbol><symbol id=\"sp-i-smartphone\" viewBox=\"0 0 24 24\"><rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /> <path d=\"M12 18h.01\" /></symbol><symbol id=\"sp-i-globe\" viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" /> <path d=\"M2 12h20\" /></symbol><symbol id=\"sp-i-shield-check\" viewBox=\"0 0 24 24\"><path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> <path d=\"m9 12 2 2 4-4\" /></symbol><symbol id=\"sp-i-square-pen\" viewBox=\"0 0 24 24\"><path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\" /> <path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\" /></symbol><symbol id=\"sp-i-messages-square\" viewBox=\"0 0 24 24\"><path d=\"M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\" /> <path d=\"M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1\" /></symbol><symbol id=\"sp-i-archive\" viewBox=\"0 0 24 24\"><rect width=\"20\" height=\"5\" x=\"2\" y=\"3\" rx=\"1\" /> <path d=\"M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8\" /> <path d=\"M10 12h4\" /></symbol><symbol id=\"sp-i-history\" viewBox=\"0 0 24 24\"><path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" /> <path d=\"M12 7v5l4 2\" /></symbol></svg>", NAMES = ["menu", "x", "panel-left", "panel-left-open", "panel-left-close", "panel-right", "chevron-left", "chevron-right", "chevron-up", "chevron-down", "chevrons-up-down", "arrow-left", "arrow-right", "arrow-up", "arrow-down", "search", "plus", "minus", "check", "trash-2", "pencil", "settings", "user", "users", "house", "download", "upload", "share-2", "copy", "bell", "funnel", "eye", "eye-off", "info", "triangle-alert", "circle-alert", "circle-check", "circle-x", "ellipsis", "ellipsis-vertical", "send", "mic", "paperclip", "sun", "moon", "log-out", "log-in", "external-link", "refresh-cw", "star", "heart", "bookmark", "lock", "mail", "phone", "calendar", "clock", "file-text", "folder", "image", "camera", "shopping-cart", "credit-card", "wifi-off", "loader-circle", "sliders-horizontal", "layout-grid", "list", "book-open", "graduation-cap", "circle-help", "message-square", "save", "undo-2", "link", "sparkles", "ghost", "circle-plus", "layout-dashboard", "chart-column", "clipboard-list", "school", "notebook-pen", "wallet", "smartphone", "globe", "shield-check", "square-pen", "messages-square", "archive", "history"];
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var reduce = function () { return global.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; };

  /* ---------- icons (Lucide, ISC licence, inlined sprite) ---------- */
  function icon(name, cls) { return '<svg class="sp-icon' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#sp-i-' + name + '"/></svg>'; }
  function mountIcons(scope) { (scope || document).querySelectorAll("[data-icon]").forEach(function (n) { var nm = n.getAttribute("data-icon"); n.removeAttribute("data-icon"); n.insertAdjacentHTML("afterbegin", icon(nm, n.getAttribute("data-icon-class") || "")); }); }
  function injectSprite() { if (document.getElementById("sp-sprite")) return; var h = el("div", null, SPRITE); h.id = "sp-sprite"; h.style.display = "none"; document.body.insertBefore(h, document.body.firstChild); mountIcons(); }
  var STATUS_ICON = { success: "circle-check", error: "circle-alert", danger: "circle-alert", warning: "triangle-alert", info: "info" };

  /* ---------- enable / disable (the reversible switch) ---------- */
  function enable() { root.setAttribute("data-theme-pack", "soft-paper"); safeSet(KEY, "1"); applyColor(safeGet(CKEY) || "system"); }
  function disable() { root.removeAttribute("data-theme-pack"); root.removeAttribute("data-color"); safeSet(KEY, "0"); }
  function toggle() { root.hasAttribute("data-theme-pack") ? disable() : enable(); }
  function applyColor(c) { if (c === "light" || c === "dark") root.setAttribute("data-color", c); else root.removeAttribute("data-color"); }
  function setColor(c) { safeSet(CKEY, c); applyColor(c); }

  /* ---------- toasts: max 3 visible, duplicates collapse (x2), pause on hover, progress line ---------- */
  var toastBox, MAX_TOASTS = 3, live = [];
  function toasts() { if (!toastBox || !toastBox.isConnected) { toastBox = el("div", "sp-toasts"); toastBox.setAttribute("role", "region"); toastBox.setAttribute("aria-live", "polite"); toastBox.setAttribute("aria-label", "Notifications"); document.body.appendChild(toastBox); } return toastBox; }
  function toast(msg, o) {
    o = o || {}; var type = o.type || "info", dur = o.duration == null ? (type === "error" || type === "warning" ? 6000 : 3500) : o.duration, key = type + "|" + msg;
    var dup = live.filter(function (t) { return t.key === key; })[0];
    if (dup) { dup.n++; dup.badge.textContent = "×" + dup.n; dup.badge.hidden = false; dup.restart(); bump(dup.el); return dup; }
    while (live.length >= MAX_TOASTS) live[0].close();
    var t = el("div", "sp-toast is-" + type + (o.soft ? " is-soft" : "")); t.setAttribute("role", type === "error" ? "alert" : "status");
    t.innerHTML = icon(STATUS_ICON[type] || "info") + '<span class="sp-toast-msg">' + esc(msg) + '</span><span class="sp-toast-n" hidden></span>';
    var badge = t.querySelector(".sp-toast-n"), timer, h = { el: t, key: key, n: 1, badge: badge, close: close, restart: restart };
    if (o.action) { var b = el("button", "sp-toast-action", esc(o.action)); b.onclick = function (e) { e.stopPropagation(); close(); o.onAction && o.onAction(); }; t.appendChild(b); }
    var bar = el("span", "sp-toast-bar"); t.appendChild(bar);
    toasts().appendChild(t); requestAnimationFrame(function () { t.classList.add("is-open"); });
    function restart() { clearTimeout(timer); bar.style.animation = "none"; void bar.offsetWidth; if (dur) { bar.style.animation = "sp-bar " + dur + "ms linear forwards"; timer = setTimeout(close, dur); } }
    function close() { clearTimeout(timer); live = live.filter(function (x) { return x !== h; }); t.classList.remove("is-open"); setTimeout(function () { t.remove(); }, 260); }
    t.addEventListener("mouseenter", function () { clearTimeout(timer); bar.style.animationPlayState = "paused"; });
    t.addEventListener("mouseleave", function () { if (dur) restart(); });
    t.addEventListener("click", function (e) { if (!e.target.closest(".sp-toast-action")) close(); });
    live.push(h); restart(); return h;
  }
  ["success", "error", "warning", "info"].forEach(function (k) { toast[k] = function (m, o) { o = o || {}; o.type = k; return toast(m, o); }; });

  /* ---------- modal core (alert / confirm / prompt / custom) ---------- */
  function openModal(build) {
    return new Promise(function (resolve) {
      var lastFocus = document.activeElement, scrim = el("div", "sp-scrim"), wrap = el("div", "sp-modal-wrap"), box = el("div", "sp-modal");
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); wrap.appendChild(box);
      document.body.append(scrim, wrap); document.body.classList.add("sp-locked");
      function done(v) {
        box.classList.remove("is-open"); scrim.classList.remove("is-open"); document.removeEventListener("keydown", key, true);
        setTimeout(function () { scrim.remove(); wrap.remove(); if (!document.querySelector(".sp-modal,.sp-sheet,.sp-sidebar.is-open")) document.body.classList.remove("sp-locked"); lastFocus && lastFocus.focus && lastFocus.focus(); }, 240); resolve(v);
      }
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); done(box._cancel); }
        if (e.key === "Tab") { var f = box.querySelectorAll("button,input,textarea,select,a[href]"); if (!f.length) return; var a = f[0], z = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
      }
      document.addEventListener("keydown", key, true);
      scrim.addEventListener("click", function () { if (!box._lock) done(box._cancel); });
      build(box, done);
      requestAnimationFrame(function () { scrim.classList.add("is-open"); box.classList.add("is-open"); mountIcons(box); var f = box.querySelector("[data-autofocus]") || box.querySelector("button:last-child"); f && f.focus(); });
    });
  }
  function head(box, o, defType) {
    var type = o.type || defType;
    if (type) box.appendChild(el("div", "sp-modal-icon is-" + type, icon(STATUS_ICON[type] || "info", "sp-icon-lg")));
    if (o.title) box.appendChild(el("h3", null, esc(o.title)));
    if (o.message) { var p = el("p", "sp-muted"); p.textContent = o.message; box.appendChild(p); }
  }
  function normalize(a, b) { return typeof a === "object" && a ? a : Object.assign({}, b || {}, { message: a }); }
  function alertM(msg, o) {
    o = normalize(msg, o); return openModal(function (box, done) {
      box._cancel = undefined; head(box, o, o.type || null);
      var act = el("div", "sp-modal-actions"), ok = el("button", null, esc(o.okText || "OK")); ok.setAttribute("data-autofocus", ""); ok.onclick = function () { done(undefined); };
      act.appendChild(ok); box.appendChild(act);
    });
  }
  function confirmM(msg, o) {
    o = normalize(msg, o); return openModal(function (box, done) {
      box._cancel = false; head(box, o, o.danger ? "danger" : "warning");
      var act = el("div", "sp-modal-actions"), no = el("button", "sp-btn-secondary", esc(o.cancelText || "Cancel")), ok = el("button", o.danger ? "sp-btn-danger" : "", esc(o.okText || "Confirm"));
      no.onclick = function () { done(false); }; ok.onclick = function () { done(true); }; (o.danger ? no : ok).setAttribute("data-autofocus", ""); act.append(no, ok); box.appendChild(act);
    });
  }
  function promptM(msg, def, o) {
    o = normalize(msg, o); if (typeof msg !== "object") o.defaultValue = def; return openModal(function (box, done) {
      box._cancel = null; head(box, o, null);
      var f = el("div", "sp-field"), inp = o.multiline ? el("textarea") : el("input"); if (!o.multiline) inp.type = o.inputType || "text";
      inp.value = o.defaultValue || ""; inp.placeholder = o.placeholder || ""; inp.setAttribute("data-autofocus", ""); f.appendChild(inp); box.appendChild(f);
      var act = el("div", "sp-modal-actions"), no = el("button", "sp-btn-secondary", esc(o.cancelText || "Cancel")), ok = el("button", null, esc(o.okText || "OK"));
      no.onclick = function () { done(null); }; ok.onclick = function () { done(inp.value); }; inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !o.multiline) done(inp.value); });
      act.append(no, ok); box.appendChild(act);
    });
  }
  function custom(o) { return openModal(function (box, done) { box._cancel = undefined; if (o.large) box.classList.add("sp-modal-lg"); head(box, o, null);
    if (o.html) { var d = el("div"); d.innerHTML = o.html; box.appendChild(d); } box._done = done; if (o.onOpen) o.onOpen(box, done); }); }

  /* ---------- bottom sheet ---------- */
  function sheet(o) {
    o = o || {}; var prev = document.activeElement, scrim = el("div", "sp-scrim"), s = el("div", "sp-sheet"); s.setAttribute("role", "dialog"); s.setAttribute("aria-modal", "true");
    s.innerHTML = '<div class="sp-sheet-handle"></div><div class="sp-sheet-head"><button class="sp-btn-icon sp-btn-bare" aria-label="Close">' + icon("x") + "</button><h3>" + esc(o.title || "") + "</h3><span></span></div>";
    var body = el("div"); if (typeof o.content === "string") body.innerHTML = o.content; else if (o.content) body.appendChild(o.content); s.appendChild(body);
    document.body.append(scrim, s); document.body.classList.add("sp-locked"); mountIcons(s);
    function close() { s.classList.remove("is-open"); scrim.classList.remove("is-open"); setTimeout(function () { s.remove(); scrim.remove(); document.body.classList.remove("sp-locked"); prev && prev.focus && prev.focus(); }, 380); document.removeEventListener("keydown", k); o.onClose && o.onClose(); }
    function k(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", k); scrim.onclick = close; s.querySelector(".sp-sheet-head button").onclick = close;
    requestAnimationFrame(function () { scrim.classList.add("is-open"); s.classList.add("is-open"); s.querySelector("button").focus(); }); return { close: close, el: s };
  }

  /* ---------- popup menu (arrow keys, Escape, focus restore) ---------- */
  function menu(anchor, items) {
    var m = el("div", "sp-menu"); m.setAttribute("role", "menu");
    items.forEach(function (it) { if (it === "-") return m.appendChild(el("div", "sp-menu-sep")); var b = el("button", "sp-menu-item" + (it.danger ? " is-danger" : ""), (it.icon ? icon(it.icon) : "") + "<span>" + esc(it.label) + "</span>"); b.setAttribute("role", "menuitem"); b.onclick = function () { close(); it.onClick && it.onClick(); }; m.appendChild(b); });
    var r = anchor.getBoundingClientRect(); m.style.top = (window.scrollY + r.bottom + 6) + "px"; m.style.left = Math.max(8, window.scrollX + r.right - 220) + "px"; document.body.appendChild(m);
    requestAnimationFrame(function () { m.classList.add("is-open"); var f = m.querySelector("button"); f && f.focus(); });
    function close() { m.classList.remove("is-open"); setTimeout(function () { m.remove(); }, 160); document.removeEventListener("pointerdown", out, true); document.removeEventListener("keydown", k); anchor.focus && anchor.focus(); }
    function out(e) { if (!m.contains(e.target)) close(); }
    function k(e) { if (e.key === "Escape") close(); if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); var b = Array.prototype.slice.call(m.querySelectorAll("button")), i = b.indexOf(document.activeElement); b[(i + (e.key === "ArrowDown" ? 1 : -1) + b.length) % b.length].focus(); } }
    setTimeout(function () { document.addEventListener("pointerdown", out, true); document.addEventListener("keydown", k); }, 0); return { close: close };
  }

  /* ---------- full-screen loader ---------- */
  var loader;
  function loading(on, text) {
    if (on === false) { loader && loader.remove(); loader = null; return; } if (loader) return;
    loader = el("div", "sp-loader-overlay", '<div class="sp-loader-card"><span class="sp-mark-spin">✺</span><span>' + esc(text || "Loading…") + "</span></div>"); loader.setAttribute("role", "status"); document.body.appendChild(loader);
  }

  /* ---------- sidebar: desktop = collapse to icon rail, phone = slide-in drawer with scrim ---------- */
  function sidebar(o) {
    var shell = o.shell, tg = o.toggle, sb = shell.querySelector(".sp-sidebar"), scrim = null, mq = matchMedia("(max-width: 800px)");
    function sync() { var open = mq.matches ? sb.classList.contains("is-open") : !shell.classList.contains("is-collapsed"); tg.setAttribute("aria-expanded", open); tg.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar"); tg.innerHTML = icon(open ? "panel-left-close" : "panel-left-open"); }
    function openD() { sb.classList.add("is-open"); scrim = el("div", "sp-scrim is-open"); scrim.onclick = closeD; document.body.appendChild(scrim); document.body.classList.add("sp-locked"); sync(); var f = sb.querySelector("a,button"); f && f.focus(); }
    function closeD() { sb.classList.remove("is-open"); if (scrim) { scrim.classList.remove("is-open"); var s = scrim; setTimeout(function () { s.remove(); }, 220); scrim = null; } document.body.classList.remove("sp-locked"); sync(); tg.focus(); }
    tg.addEventListener("click", function () { if (mq.matches) { sb.classList.contains("is-open") ? closeD() : openD(); } else { shell.classList.toggle("is-collapsed"); safeSet("sp-sb-collapsed", shell.classList.contains("is-collapsed") ? "1" : "0"); sync(); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sb.classList.contains("is-open")) closeD(); });
    if (mq.addEventListener) mq.addEventListener("change", function () { if (scrim) closeD(); sync(); });
    if (!mq.matches && safeGet("sp-sb-collapsed") === "1") shell.classList.add("is-collapsed"); sync();
    return { open: openD, close: closeD };
  }

  /* ---------- sliding indicator for tabs / segmented controls ---------- */
  function slider(box, itemSel, activeSel, cls, attr) {
    var ink = box.querySelector("." + cls) || box.appendChild(el("span", cls)); box.classList.add("has-ink");
    function move() { var a = box.querySelector(activeSel); if (!a) { ink.style.opacity = 0; return; } ink.style.opacity = 1; ink.style.width = a.offsetWidth + "px"; ink.style.transform = "translateX(" + a.offsetLeft + "px)"; }
    box.addEventListener("click", function (e) { var it = e.target.closest(itemSel); if (!it || it.parentNode !== box) return; Array.prototype.forEach.call(box.children, function (n) { if (n !== ink) n.removeAttribute(attr); }); it.setAttribute(attr, "true"); move(); });
    window.addEventListener("resize", move); ink.style.transition = "none"; move(); requestAnimationFrame(function () { ink.style.transition = ""; }); return { update: move };
  }
  function tabs(box) { return slider(box, "button,a", '[aria-selected="true"]', "sp-tab-ink", "aria-selected"); }
  function segmented(box) { return slider(box, "button", '[aria-pressed="true"]', "sp-seg-thumb", "aria-pressed"); }

  /* ---------- screen transitions (fade + 12px rise; focus + scroll handled) ---------- */
  function transition(update, o) {
    o = o || {}; var main = document.querySelector(o.target || "[data-sp-main], main");
    function after() { if (!main) return; window.scrollTo(0, 0); var h = main.querySelector("h1,h2") || main; if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); main.classList.remove("sp-enter"); void main.offsetWidth; if (!reduce()) main.classList.add("sp-enter"); }
    return Promise.resolve(update()).then(after);
  }
  function bump(n) { n.classList.remove("sp-bump"); void n.offsetWidth; n.classList.add("sp-bump"); }

  /* ---------- async button: locks width, spinner, success/error flash. Never claims success before fn resolves ---------- */
  function asyncButton(btn, fn, o) {
    o = o || {}; if (btn.getAttribute("aria-busy") === "true") return Promise.resolve();
    var html = btn.innerHTML, w = btn.offsetWidth; btn.style.width = w + "px"; btn.setAttribute("aria-busy", "true"); btn.setAttribute("aria-label", o.loadingText || "Working");
    function reset() { btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-label"); btn.classList.remove("is-success-flash", "is-error-flash"); btn.innerHTML = html; btn.style.width = ""; }
    function flash(cls, label) { btn.removeAttribute("aria-busy"); btn.removeAttribute("aria-label"); btn.classList.add(cls); btn.innerHTML = icon(cls === "is-success-flash" ? "check" : "circle-alert") + "<span>" + esc(label) + "</span>"; setTimeout(reset, 1400); }
    return Promise.resolve().then(fn).then(function (v) { flash("is-success-flash", o.successText || "Done"); return v; }, function (e) { flash("is-error-flash", o.errorText || "Failed"); throw e; });
  }

  /* ---------- status card: explicit async state machine (payments, downloads, uploads) ----------
     States: idle | submitting | awaiting | pending | success | failure.
     This library never sets 'success' by itself: call set('success') only after the SERVER confirmed. */
  var STATE = { idle: ["", "info"], submitting: ["spin", "info"], awaiting: ["spin", "info"], pending: ["triangle-alert", "warning"], success: ["circle-check", "success"], failure: ["circle-alert", "error"] };
  function status(box) {
    box.classList.add("sp-status"); box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
    function set(state, c) {
      c = c || {}; var d = STATE[state] || STATE.idle; box.className = "sp-status is-" + d[1] + " is-" + state; box.setAttribute("data-state", state);
      box.innerHTML = '<span class="sp-status-ic">' + (d[0] === "spin" ? '<span class="sp-spinner"></span>' : d[0] ? icon(d[0], "sp-icon-lg") : "") + '</span><div class="sp-status-body"><div class="sp-status-title">' + esc(c.title || "") + '</div><div class="sp-muted">' + esc(c.text || "") + "</div></div>";
      if (c.actions) { var a = el("div", "sp-status-actions"); c.actions.forEach(function (x) { var b = el("button", x.primary ? "" : "sp-btn-secondary sp-btn-sm", esc(x.label)); b.onclick = x.onClick; a.appendChild(b); }); box.appendChild(a); }
      box.classList.remove("sp-enter"); void box.offsetWidth; if (!reduce()) box.classList.add("sp-enter");
    }
    return { set: set };
  }

  /* ---------- offline banner ---------- */
  var offBar;
  function offlineBanner(on) {
    function show() { if (offBar) return; offBar = el("div", "sp-banner is-warning sp-banner-sticky", icon("wifi-off") + '<div class="sp-banner-body"><span class="sp-banner-title">You\'re offline.</span> Some actions may not work.</div>'); offBar.setAttribute("role", "status"); document.body.insertBefore(offBar, document.body.firstChild); }
    function hide() { if (offBar) { offBar.remove(); offBar = null; toast.success("Back online"); } }
    if (on === false) { window.removeEventListener("offline", show); window.removeEventListener("online", hide); return; }
    window.addEventListener("offline", show); window.addEventListener("online", hide); if (!navigator.onLine) show();
  }

  /* ---------- delegated behaviours: ripple, haptic, tooltip, textbox helpers ---------- */
  document.addEventListener("pointerdown", function (e) {
    if (!root.hasAttribute("data-theme-pack")) return; var b = e.target.closest("button,.sp-btn"); if (!b || b.disabled || reduce()) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.2, dot = el("span", "sp-ripple-dot");
    dot.style.cssText = "width:" + d + "px;height:" + d + "px;left:" + (e.clientX - r.left - d / 2) + "px;top:" + (e.clientY - r.top - d / 2) + "px"; b.appendChild(dot); setTimeout(function () { dot.remove(); }, 560);
    if (navigator.vibrate && b.dataset.haptic !== "off") try { navigator.vibrate(8); } catch (x) {}
  }, { passive: true });
  document.addEventListener("scroll", function () { var t = document.querySelector(".sp-topbar,.sp-navbar"); t && t.classList.toggle("is-scrolled", window.scrollY > 4); }, { passive: true });
  document.addEventListener("click", function (e) {
    var c = e.target.closest("[data-sp-clear]"); if (c) { var i = c.closest(".sp-textbox").querySelector("input,textarea"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); i.focus(); }
    var p = e.target.closest("[data-sp-password]"); if (p) { var f = p.closest(".sp-textbox").querySelector("input"), show = f.type === "password"; f.type = show ? "text" : "password"; p.setAttribute("aria-label", show ? "Hide password" : "Show password"); p.innerHTML = icon(show ? "eye-off" : "eye"); }
  });
  document.addEventListener("input", function (e) {
    var t = e.target; if (t.matches && t.matches("textarea[data-sp-autogrow]")) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, parseInt(t.getAttribute("data-sp-autogrow")) || 240) + "px"; }
    var tb = t.closest && t.closest(".sp-textbox"); if (tb) { tb.classList.toggle("has-value", !!t.value); var ct = tb.querySelector("[data-sp-counter]") || (tb.parentElement && tb.parentElement.querySelector("[data-sp-counter]")); if (ct) { var mx = t.maxLength > 0 ? t.maxLength : ""; ct.textContent = t.value.length + (mx ? " / " + mx : ""); ct.classList.toggle("is-over", !!mx && t.value.length >= mx); } }
  });

  /* OTP boxes (auto-advance, backspace, paste) and number stepper */
  document.addEventListener("input", function (e) { var i = e.target; if (!i.closest) return; var o = i.closest(".sp-otp"); if (!o) return; var all = Array.prototype.slice.call(o.querySelectorAll("input")), ix = all.indexOf(i);
    if (i.value.length > 1) { var v = i.value.replace(/\D/g, "").split(""); all.forEach(function (n, k) { if (k >= ix && v[k - ix]) n.value = v[k - ix]; }); (all[Math.min(all.length - 1, ix + v.length)] || i).focus(); } else if (i.value && all[ix + 1]) all[ix + 1].focus(); });
  document.addEventListener("keydown", function (e) { var i = e.target; if (e.key === "Backspace" && i.closest && i.closest(".sp-otp") && !i.value) { var p = i.previousElementSibling; p && p.focus(); } });
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-sp-step]"); if (!b) return; var i = b.closest(".sp-numstep").querySelector("input"), d = parseInt(b.getAttribute("data-sp-step")), mn = i.min !== "" ? +i.min : -Infinity, mx = i.max !== "" ? +i.max : Infinity; i.value = Math.min(mx, Math.max(mn, (+i.value || 0) + d)); i.dispatchEvent(new Event("input", { bubbles: true })); bump(i); });
  var tip;
  function hideTip() { if (tip) { tip.remove(); tip = null; } }
  function showTip(t) { var txt = t.getAttribute("data-tip"); if (!txt || !matchMedia("(hover:hover)").matches) return; hideTip(); tip = el("div", "sp-tooltip", esc(txt)); tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); var r = t.getBoundingClientRect(); tip.style.left = Math.max(8, window.scrollX + r.left + r.width / 2 - tip.offsetWidth / 2) + "px"; tip.style.top = (window.scrollY + r.bottom + 8) + "px"; requestAnimationFrame(function () { tip && tip.classList.add("is-open"); }); }
  document.addEventListener("mouseover", function (e) { var t = e.target.closest && e.target.closest("[data-tip]"); t ? showTip(t) : hideTip(); });
  document.addEventListener("focusin", function (e) { var t = e.target.closest && e.target.closest("[data-tip]"); t && showTip(t); }); document.addEventListener("focusout", hideTip);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });

  /* ---------- replace native alert / confirm / prompt ---------- */
  var native = { alert: global.alert, confirm: global.confirm, prompt: global.prompt };
  function takeOverNativeDialogs() {
    global.alert = function (m) { alertM(m); };
    global.confirm = function (m) { console.warn("SoftPaper: confirm() cannot block. Use `await SoftPaper.confirm(...)`."); confirmM(m); return false; };
    global.prompt = function (m, d) { console.warn("SoftPaper: prompt() cannot block. Use `await SoftPaper.prompt(...)`."); promptM(m, d); return null; };
  }
  function restoreNativeDialogs() { global.alert = native.alert; global.confirm = native.confirm; global.prompt = native.prompt; }

  global.SoftPaper = { enable: enable, disable: disable, toggle: toggle, setColor: setColor, toast: toast, alert: alertM, confirm: confirmM, prompt: promptM, modal: custom, sheet: sheet, menu: menu, loading: loading,
    sidebar: sidebar, tabs: tabs, segmented: segmented, transition: transition, bump: bump, asyncButton: asyncButton, status: status, offlineBanner: offlineBanner,
    icon: icon, mountIcons: mountIcons, iconNames: NAMES, takeOverNativeDialogs: takeOverNativeDialogs, restoreNativeDialogs: restoreNativeDialogs };
  function boot() { injectSprite(); new MutationObserver(function () { mountIcons(); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.body) boot(); else document.addEventListener("DOMContentLoaded", boot);
  if (safeGet(KEY) !== "0" && !root.hasAttribute("data-theme-pack-manual")) enable();
})(window);
