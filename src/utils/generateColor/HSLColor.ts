/*
 * Copyright (c) 2021 Tobias Hegemann
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

class HSLColor {
    private readonly _hue: number

    private readonly _saturation: number

    private readonly _luminance: number

    private readonly _alpha: number

    constructor(hue: number, saturation = 70, luminance = 80, alpha = 1) {
        this._hue = hue
        this._saturation = saturation
        this._luminance = luminance
        this._alpha = alpha
    }

    get h(): number {
        return this._hue
    }

    get s(): number {
        return this._saturation
    }

    get l(): number {
        return this._luminance
    }

    get a(): number {
        return this._alpha
    }

    hue(hue: number): HSLColor {
        return new HSLColor(hue, this._saturation, this._luminance, this._alpha)
    }

    saturation(saturation: number): HSLColor {
        return new HSLColor(this._hue, saturation, this._luminance, this._alpha)
    }

    luminance(luminance: number): HSLColor {
        return new HSLColor(this._hue, this._saturation, luminance, this._alpha)
    }

    alpha(alpha: number): HSLColor {
        return new HSLColor(this._hue, this._saturation, this._luminance, alpha)
    }

    toString(): string {
        return `hsla(${this._hue},${this._saturation}%,${this._luminance}%,${this._alpha})`
    }
}

export { HSLColor }
