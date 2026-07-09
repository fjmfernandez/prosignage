(() => {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-button]");
    if (!button) {
      return;
    }

    const wrapper = button.closest(".screen-url");
    const input = wrapper ? wrapper.querySelector("[data-copy-source]") : null;
    if (!input) {
      return;
    }

    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = "Copiado";
      setTimeout(() => {
        button.textContent = "Copiar URL";
      }, 1600);
    } catch (error) {
      input.select();
      document.execCommand("copy");
      button.textContent = "Copiado";
      setTimeout(() => {
        button.textContent = "Copiar URL";
      }, 1600);
    }
  });
})();
