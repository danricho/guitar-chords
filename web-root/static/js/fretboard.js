const kidSwitch = document.getElementById("kidSwitch");
function showChord(name, positions) {
  // https://jguitar.com/chordsearch
  const lookup = {
    A: "x02220",
    Am: "x02210",
    A7: "x02020",
    Ab5: "xxx144",
    B: "x24442",
    Bm: "xx3321",
    B7: "x21202",
    Bb: "xx3331",
    Bb5: "x133xx",
    C: "x32010",
    C5: "xxxx13",
    C7: "x98910",
    D: "xx0232",
    Dm: "xx0231",
    E: "022100",
    Em: "022000",
    Eb5: "xx134x",
    F: "133211",
    Fmaj7: "xx3210",
    G: "320003",
    G6: "xx0000",
    G7: "980007",
    "": "",
  };
  positions = lookup[name] ?? "";
  let fresh = $("#fretboard-template").clone();
  fresh.attr("id", "");
  fresh.find(".chord-name").text(name);
  if (positions == "") {
    fresh.find(".unknown").show();
  }
  Array.from(positions).forEach((char, index) => {
    if (char == "x") {
      fresh.find(`g.string-${index + 1} > .mute`).show();
    } else if (char == "0") {
      fresh.find(`g.string-${index + 1} > .open`).show();
    } else {
      fresh.find(`g.string-${index + 1} > .fret-${char}`).show();
    }
  });
  $("#fretboards").append(fresh);
  fresh.show();
}
function clearChords() {
  $("#fretboards").empty();
}
