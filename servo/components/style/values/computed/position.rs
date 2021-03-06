/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! CSS handling for the computed value of
//! [`position`][position] values.
//!
//! [position]: https://drafts.csswg.org/css-backgrounds-3/#position

use std::fmt::{self, Write};
use style_traits::{CssWriter, ToCss};
use values::computed::{LengthOrPercentage, Percentage};
use values::generics::position::Position as GenericPosition;
pub use values::specified::position::{GridAutoFlow, GridTemplateAreas};

/// The computed value of a CSS `<position>`
pub type Position = GenericPosition<HorizontalPosition, VerticalPosition>;

/// The computed value of a CSS horizontal position.
pub type HorizontalPosition = LengthOrPercentage;

/// The computed value of a CSS vertical position.
pub type VerticalPosition = LengthOrPercentage;

impl Position {
    /// `50% 50%`
    #[inline]
    pub fn center() -> Self {
        Self::new(
            LengthOrPercentage::Percentage(Percentage(0.5)),
            LengthOrPercentage::Percentage(Percentage(0.5)),
        )
    }

    /// `0% 0%`
    #[inline]
    pub fn zero() -> Self {
        Self::new(LengthOrPercentage::zero(), LengthOrPercentage::zero())
    }
}

impl ToCss for Position {
    fn to_css<W>(&self, dest: &mut CssWriter<W>) -> fmt::Result
    where
        W: Write,
    {
        self.horizontal.to_css(dest)?;
        dest.write_str(" ")?;
        self.vertical.to_css(dest)
    }
}
