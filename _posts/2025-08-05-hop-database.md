---
layout: single
title: "HopDatabase - A Web Tool for Hop Comparison"
excerpt: "A comprehensive database with detailed information from various hop producers' websites, combined with an advanced interactive web application for brewing analysis and hop comparison."
date: 2025-08-05
classes: wide
header:
  teaser: /assets/images/logo_transparent_small.png
tags:
  - C++
  - Web
  - Python
  - hops
  - beer
---

As someone who enjoys both brewing and building useful tools, I recently found myself frustrated when trying to compare different hop varieties for my homebrewing projects. Jumping between multiple producer websites, trying to remember which hops had what characteristics, and comparing aroma profiles was becoming a real pain point.

So, I decided to build something about it - introducing the **HopDatabase**, a comprehensive web tool that brings together hop data from multiple producers into one interactive comparison platform!

[![Python Scripts CI](https://github.com/kasperg3/HopDatabase/actions/workflows/ci.yaml/badge.svg)](https://github.com/kasperg3/HopDatabase/actions/workflows/ci.yaml)

## 🌐 What I Built

**[🔗 Try the Hop Comparison Tool](https://kasperg3.github.io/HopDatabase)** - Live demo available now!

The tool aggregates hop data from major producers like Hopsteiner, Yakima Chief Hops, BarthHaas, and Crosby Hops into a single, searchable database. You can select up to 5 hop varieties and compare them side-by-side with interactive radar charts and detailed brewing parameters.

## ✨ Key Features That Make It Useful

### Interactive Hop Comparison

The heart of the tool is the visual comparison system. You can select multiple hop varieties and see their aroma profiles displayed as interactive radar charts. This makes it immediately obvious which hops share similar characteristics and which ones might complement each other in a recipe.

![Hop Aroma Profile Comparison](/assets/posts/hop-database/aroma_profile.png)

### Brewing-Focused Analysis

Beyond just displaying data, the tool provides practical brewing insights:

- **Chemistry-based classifications** using modern hop science
- **IBU yield predictions** based on cohumulone content
- **Storage stability assessments** through Beta:Alpha ratio analysis
- **Process optimization suggestions** for whirlpool, dry hop, and biotransformation

![Brewing Parameters Analysis](/assets/posts/hop-database/brewing_parameters.png)

The interface is designed to be mobile-friendly, so you can use it right in your brewery or while shopping for ingredients.

## 🔧 The Technical Challenge

Building this tool involved some interesting technical challenges. I had to create web scrapers for multiple hop producer websites, each with their own data format and structure:

- **🌾 Hopsteiner** - Premium varieties with detailed chemistry data
- **🏔️ Yakima Chief Hops** - Pacific Northwest expertise
- **🇩🇪 BarthHaas** - Traditional European varieties
- **🇺🇸 Crosby Hops** - Comprehensive aroma profiles

The backend is a Python package that handles data extraction and normalization, while the frontend uses React with Mantine UI for the interactive components.

## 🚀 Try It Out

If you're a brewer, head over to **[the live application](https://kasperg3.github.io/HopDatabase)** and give it a spin! Select a few hop varieties you're curious about and see how they compare. The tool currently includes over 500 hop varieties from major producers.

For developers who want to tinker with the code or run their own instance, the project is open source on GitHub. You can clone it, install the dependencies, and start exploring the data pipeline that powers the whole thing.

## 💭 What's Next?

This project has been a fun intersection of my interests in brewing and software development. I'm particularly excited about the brewing science integration - there's so much interesting research happening around hop chemistry and how it affects the final beer.

I'm always looking for ways to improve the tool, whether that's adding new data sources, improving the analysis algorithms, or making the interface even more intuitive. If you're a brewer and have suggestions, or if you're a developer interested in contributing, I'd love to hear from you!

## 📬 Contact & Support

- **Email**: [kaspergrontved@gmail.com](mailto:kaspergrontved@gmail.com)
- **Issues**: [GitHub Issues](https://github.com/kasperg3/HopDatabase/issues)
- **Discussions**: [GitHub Discussions](https://github.com/kasperg3/HopDatabase/discussions)

---

**🍻 Happy Brewing!**

Made with ❤️ for the homebrewing and craft beer community
