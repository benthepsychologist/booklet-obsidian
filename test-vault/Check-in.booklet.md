---
booklet: "0.15"
id: booklet-test/check-in
title: Check-in
lang: en
---

# Check-in

A made-up check-in for testing the Booklet plugin. Nothing in it is about a real person, and any answer will do.

> [!module|day-check] A short check-in

Four short questions about the day, kept once a day. Finalizing again the same day replaces that day's entry.

> [!activity|today repeat daily] Today

Take a moment. There are no right answers here.

> [!widget|places] Where do you notice it?
> ![[#^body-places]]

> [!widget|weather] What is the weather inside?
> ![[#^inner-weather]]

> [!multi|where open menu:spots] Where were you today?

> [!lines|thoughts] What is on your mind?

> [!module|day-check end] End of A short check-in

> [!data|day-check] Data for A short check-in

```booklet widget
{ "engine": "svg-regions",
  "regions": [
    { "id": "head", "label": "Head" },
    { "id": "jaw", "label": "Jaw" },
    { "id": "neck", "label": "Neck" },
    { "id": "shoulders", "label": "Shoulders" },
    { "id": "chest", "label": "Chest" },
    { "id": "arms", "label": "Arms" },
    { "id": "hands", "label": "Hands" },
    { "id": "stomach", "label": "Stomach" },
    { "id": "back", "label": "Back" },
    { "id": "legs", "label": "Legs" },
    { "id": "feet", "label": "Feet" } ],
  "senses": [
    { "id": "temperature", "label": "Temperature", "words": [
      { "id": "warm", "label": "Warm" },
      { "id": "cool", "label": "Cool" } ] },
    { "id": "pressure", "label": "Pressure", "words": [
      { "id": "tight", "label": "Tight" },
      { "id": "heavy", "label": "Heavy" },
      { "id": "loose", "label": "Loose" } ] },
    { "id": "movement", "label": "Movement", "words": [
      { "id": "tingling", "label": "Tingling" },
      { "id": "restless", "label": "Restless" },
      { "id": "still", "label": "Still" } ] } ],
  "chips": ["head", "jaw", "neck", "shoulders", "chest", "arms", "hands", "stomach", "back", "legs", "feet"],
  "copy": {
    "h": "Places",
    "p": "Press a place, then say what it is like there.",
    "pick": "Press any words that fit, or add words of your own.",
    "clear": "Clear this place",
    "none": "Press a place above to begin." } }
```
^body-places

```booklet widget
{ "engine": "grid-select",
  "axes": { "top": "more energy", "bottom": "less energy", "left": "less pleasant", "right": "more pleasant" },
  "cells": [
    { "id": "stormy", "label": "Stormy", "note": "Lots of energy, and not pleasant.", "color": "warm" },
    { "id": "bright", "label": "Bright", "note": "Lots of energy, and pleasant.", "color": "green" },
    { "id": "overcast", "label": "Overcast", "note": "Little energy, and not pleasant.", "color": "slate" },
    { "id": "calm", "label": "Calm", "note": "Little energy, and pleasant.", "color": "teal" }
  ],
  "items": [
    { "id": "rushed", "cell": "stormy", "label": "Rushed" },
    { "id": "tense", "cell": "stormy", "label": "Tense" },
    { "id": "lively", "cell": "bright", "label": "Lively" },
    { "id": "cheerful", "cell": "bright", "label": "Cheerful" },
    { "id": "flat", "cell": "overcast", "label": "Flat" },
    { "id": "tired", "cell": "overcast", "label": "Tired" },
    { "id": "settled", "cell": "calm", "label": "Settled" },
    { "id": "content", "cell": "calm", "label": "Content" } ],
  "copy": { "h": "Inner weather", "p": "Press the words that fit, in any of the four." } }
```
^inner-weather

> [!menu|spots]
- At home
- At work
- Outdoors
- Travelling
