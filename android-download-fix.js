(() => {
  const nativeClick = HTMLAnchorElement.prototype.click;

  HTMLAnchorElement.prototype.click = function() {
    const href = this.href || "";
    const filename = this.getAttribute("download") || "";

    if (!filename || !href.startsWith("blob:")) {
      return nativeClick.call(this);
    }

    fetch(href)
      .then(response => response.blob())
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.setAttribute("download", filename);
        a.style.display = "none";
        document.body.appendChild(a);
        nativeClick.call(a);
        a.remove();
      })
      .catch(() => nativeClick.call(this));
  };
})();
