
    function d3(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0,
            f = 0,
            g = 0,
            h = 0,
            j = 0,
            l = 0,
            m = 0,
            n = 0,
            o = 0,
            p = 0;
        p = r;
        if ((c | 0) == 0 | (a | 0) == (c | 0)) {
            b = 0;
            r = p;
            return b | 0
        }
        if (!((i[a + 124 >> 0] | 0) != 1 & (i[731736] | 0) == 0)) {
            b = 0;
            r = p;
            return b | 0
        }
        if (i[c + 124 >> 0] | 0) {
            b = 0;
            r = p;
            return b | 0
        }
        l = (k[178362] | 0) + 3 | 0;
        if ((l >>> 0 < 26 ? (67107488 >>> l & 1 | 0) != 0 : 0) ? (Hja(a + 844 | 0, c + 844 | 0) | 0) == 0 : 0) {
            b = 0;
            r = p;
            return b | 0
        }
        a: do
            if (d) {
                o = b + 8 | 0;
                b: do
                    if ((k[o >> 2] | 0) != 2 | (d & 1 | 0) == 0 ? (j = k[c + 1376 >> 2] | 0, m = a + 1376 | 0, g = k[m >> 2] | 0, (g | 0) > 0 & (k[187324] | 0) > (g | 0)) : 0) {
                        l = a + 1368 | 0;
                        f = 1;
                        h = 0;
                        while (1) {
                            e = k[l >> 2] | 0;
                            if ((f ? (k[e + 20 >> 2] | 0) > 1 : 0) ? (k[k[e + 12 >> 2] >> 2] | 0) == (j | 0) : 0) break;
                            if (Nea(a, g, j, e + 12 | 0, 712368, h) | 0) {
                                n = 16;
                                break
                            }
                            if ((h | 0) >= 2) break b;
                            g = k[m >> 2] | 0;
                            if (!((g | 0) > 0 & (k[187324] | 0) > (g | 0))) break b;
                            else {
                                f = 0;
                                h = h + 1 | 0
                            }
                        }
                        if ((n | 0) == 16) {
                            i[b + 20 >> 0] = 0;
                            e = k[l >> 2] | 0
                        }
                        f = k[c + 436 >> 2] | 0;
                        g = k[b >> 2] | 0;
                        if ((g | 0) == 2)
                            if ((k[o >> 2] | 0) == 1) n = 21;
                            else n = 22;
                        else if ((g | 0) == 3 ? (k[o >> 2] | 0) == 0 : 0) n = 21;
                        else n = 22;
                        if ((n | 0) == 21) {
                            k[b + 4 >> 2] = k[15422];
                            k[b + 12 >> 2] = f;
                            k[b + 16 >> 2] = 0;
                            i[b + 20 >> 0] = 0;
                            break a
                        } else if ((n | 0) == 22) {
                            J3(e, 2, 1, f) | 0;
                            break a
                        }
                    }
                while (0);
                if ((d | 0) > 2) {
                    b = 0;
                    r = p;
                    return b | 0
                }
            }
        while (0);
        f = k[a + 1368 >> 2] | 0;
        g = f + 48 | 0;
        e = k[c + 436 >> 2] | 0;
        if ((k[g >> 2] | 0) == (e | 0)) {
            b = 1;
            r = p;
            return b | 0
        }
        b = k[15422] | 0;
        k[f + 56 >> 2] = b;
        k[f + 52 >> 2] = b;
        k[g >> 2] = e;
        b = 1;
        r = p;
        return b | 0
    }