(function () {
  'use strict';

  var buildBtnSelector = '.snippet-card__build-btn';
  var choiceModal = document.getElementById('wp-choice-modal');
  var codeModal = document.getElementById('wp-snippet-modal');
  var codeEl = document.getElementById('wp-modal-code');
  var copyBtn = document.getElementById('wp-modal-copy');
  var lastContent = '';

  function buildWordPressSnippet(path) {
    var base = path.replace(/\/$/, '');
    var prefix = base ? base + '/' : '';
    return Promise.all([
      fetch(prefix + 'snippet.html').then(function (r) { return r.text(); }),
      fetch(prefix + 'snippet.js').then(function (r) { return r.text(); }),
      fetch(prefix + 'snippet.css').then(function (r) { return r.text(); }),
    ]).then(function (parts) {
      var html = parts[0].trim();
      var js = parts[1].trim();
      var css = parts[2].trim();
      return '<!-- Gegenereerd voor WordPress / Code Snippets - plak als HTML-snippet -->\n' + html + '\n<scr' + 'ipt>\n' + js + '\n</scr' + 'ipt>\n<style>\n' + css + '\n</style>\n';
    });
  }

  function download(content, filename) {
    var blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openChoiceModal() {
    choiceModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeChoiceModal() {
    choiceModal.hidden = true;
    document.body.style.overflow = '';
  }

  function openCodeModal(content) {
    lastContent = content;
    codeEl.textContent = content;
    codeModal.hidden = false;
    document.body.style.overflow = 'hidden';
    copyBtn.textContent = 'Copy code';
    codeEl.parentElement.scrollTop = 0;
  }

  function closeCodeModal() {
    codeModal.hidden = true;
    document.body.style.overflow = '';
  }

  function copyCode() {
    function showDone() {
      copyBtn.textContent = 'Gekopieerd ✓';
      setTimeout(function () { copyBtn.textContent = 'Copy code'; }, 2000);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(lastContent).then(showDone).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      var ta = document.createElement('textarea');
      ta.value = lastContent;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        if (document.execCommand('copy')) showDone();
        else copyBtn.textContent = 'Kopiëren mislukt';
      } catch (e) {
        copyBtn.textContent = 'Kopiëren mislukt';
      }
      document.body.removeChild(ta);
      setTimeout(function () { copyBtn.textContent = 'Copy code'; }, 2000);
    }
  }

  document.querySelectorAll('.wp-choice-backdrop, .wp-choice-close').forEach(function (el) {
    el.addEventListener('click', closeChoiceModal);
  });
  document.querySelectorAll('.wp-code-backdrop, .wp-code-close, #wp-modal-close-btn').forEach(function (el) {
    el.addEventListener('click', closeCodeModal);
  });
  document.getElementById('wp-choice-download').addEventListener('click', function () {
    if (lastContent) download(lastContent, 'snippet-wordpress.html');
    closeChoiceModal();
  });
  document.getElementById('wp-choice-code').addEventListener('click', function () {
    closeChoiceModal();
    openCodeModal(lastContent);
  });
  copyBtn.addEventListener('click', copyCode);
  choiceModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeChoiceModal();
  });
  codeModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCodeModal();
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest(buildBtnSelector);
    if (!btn) return;
    e.preventDefault();
    var path = btn.getAttribute('data-snippet-path');
    if (!path) return;
    btn.disabled = true;
    btn.textContent = 'Bezig…';
    buildWordPressSnippet(path)
      .then(function (content) {
        lastContent = content;
        openChoiceModal();
        btn.textContent = 'Export voor WordPress';
      })
      .catch(function (err) {
        console.error(err);
        btn.textContent = 'Fout – zie console';
      })
      .finally(function () {
        btn.disabled = false;
        setTimeout(function () { btn.textContent = 'Export voor WordPress'; }, 1500);
      });
  });

  var newSnippetModal = document.getElementById('new-snippet-modal');
  var newSnippetFormWrap = document.getElementById('new-snippet-form-wrap');
  var newSnippetResultWrap = document.getElementById('new-snippet-result-wrap');
  var newSnippetForm = document.getElementById('new-snippet-form');
  var newSnippetCommand = document.getElementById('new-snippet-command');
  var newSnippetCopyBtn = document.getElementById('new-snippet-copy-btn');

  function sanitizeSnippetInput(val) {
    return (val || '').toLowerCase().replace(/\s/g, '').replace(/[^a-z0-9-]/g, '');
  }

  function openNewSnippetModal() {
    newSnippetFormWrap.hidden = false;
    newSnippetResultWrap.hidden = true;
    newSnippetForm.reset();
    newSnippetModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeNewSnippetModal() {
    newSnippetModal.hidden = true;
    document.body.style.overflow = '';
  }

  document.getElementById('new-snippet-open-btn').addEventListener('click', openNewSnippetModal);
  document.querySelectorAll('.new-snippet-backdrop, .new-snippet-close').forEach(function (el) {
    el.addEventListener('click', closeNewSnippetModal);
  });
  newSnippetModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNewSnippetModal();
  });

  [ 'new-snippet-klant', 'new-snippet-naam' ].forEach(function (id) {
    var input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', function () {
      var start = this.selectionStart;
      var sanitized = sanitizeSnippetInput(this.value);
      if (sanitized !== this.value) {
        this.value = sanitized;
        this.setSelectionRange(Math.min(start, sanitized.length), Math.min(start, sanitized.length));
      }
    });
    input.addEventListener('paste', function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData('text');
      var sanitized = sanitizeSnippetInput(pasted);
      var start = this.selectionStart;
      var end = this.selectionEnd;
      var v = this.value;
      this.value = v.slice(0, start) + sanitized + v.slice(end);
      this.setSelectionRange(start + sanitized.length, start + sanitized.length);
    });
  });

  if (newSnippetForm) {
    newSnippetForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var klant = sanitizeSnippetInput(document.getElementById('new-snippet-klant').value);
      var naam = sanitizeSnippetInput(document.getElementById('new-snippet-naam').value);
      if (!klant || !naam) return;
      var cmd = 'node scripts/new-snippet.js ' + klant + ' ' + naam;
      newSnippetCommand.textContent = cmd;
      newSnippetFormWrap.hidden = true;
      newSnippetResultWrap.hidden = false;
      newSnippetCopyBtn.focus();
    });
  }

  if (newSnippetCopyBtn) {
    newSnippetCopyBtn.addEventListener('click', function () {
      var cmd = newSnippetCommand.textContent;
      function showDone() {
        newSnippetCopyBtn.textContent = 'Gekopieerd ✓';
        setTimeout(function () { newSnippetCopyBtn.textContent = 'Kopiëren'; }, 2000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cmd).then(showDone).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = cmd;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); showDone(); } catch (err) { newSnippetCopyBtn.textContent = 'Kopiëren mislukt'; }
        document.body.removeChild(ta);
        setTimeout(function () { newSnippetCopyBtn.textContent = 'Kopiëren'; }, 2000);
      }
    });
  }
  document.getElementById('new-snippet-close-btn').addEventListener('click', closeNewSnippetModal);

  var removeSnippetModal = document.getElementById('remove-snippet-modal');
  var removeSnippetCommand = document.getElementById('remove-snippet-command');
  var removeSnippetCopyBtn = document.getElementById('remove-snippet-copy-btn');

  function openRemoveSnippetModal(snippetPath) {
    var parts = snippetPath.replace(/^snippets\/?/, '').split('/');
    var klant = parts[0];
    var naam = parts[1];
    if (!klant || !naam) return;
    var cmd = 'node scripts/remove-snippet.js ' + klant + ' ' + naam;
    removeSnippetCommand.textContent = cmd;
    removeSnippetModal.hidden = false;
    document.body.style.overflow = 'hidden';
    removeSnippetCopyBtn.focus();
  }

  function closeRemoveSnippetModal() {
    removeSnippetModal.hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.remove-snippet-backdrop, .remove-snippet-close').forEach(function (el) {
    el.addEventListener('click', closeRemoveSnippetModal);
  });
  removeSnippetModal.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeRemoveSnippetModal();
  });
  document.getElementById('remove-snippet-close-btn').addEventListener('click', closeRemoveSnippetModal);

  if (removeSnippetCopyBtn) {
    removeSnippetCopyBtn.addEventListener('click', function () {
      var cmd = removeSnippetCommand.textContent;
      function showDone() {
        removeSnippetCopyBtn.textContent = 'Gekopieerd ✓';
        setTimeout(function () { removeSnippetCopyBtn.textContent = 'Kopiëren'; }, 2000);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(cmd).then(showDone).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        var ta = document.createElement('textarea');
        ta.value = cmd;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand('copy'); showDone(); } catch (err) { removeSnippetCopyBtn.textContent = 'Kopiëren mislukt'; }
        document.body.removeChild(ta);
        setTimeout(function () { removeSnippetCopyBtn.textContent = 'Kopiëren'; }, 2000);
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.snippet-card__remove-btn');
    if (!btn) return;
    e.preventDefault();
    var path = btn.getAttribute('data-snippet-path');
    if (path) openRemoveSnippetModal(path);
  });
})();
