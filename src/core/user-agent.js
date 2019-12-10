export const mac = /Mac/i.test(navigator.platform);
export const android = /android/i.test(navigator.userAgent);
export const iOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
export const mobile = iOS || android;
export const firefox = /Firefox/.test(navigator.userAgent);
export const safari = /Apple Computer/.test(navigator.vendor);
