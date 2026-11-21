use std::{
    fs::File,
    io::{Read, Seek, Write},
};

pub(crate) struct PrintSettings {
    pub printer: String,
    pub width: i32,
    pub height: i32,
    pub width_tenths: i32,
    pub height_tenths: i32,
}

impl PrintSettings {
    pub fn validate(&self) -> Result<(), String> {
        if self.printer.is_empty()
            || self.printer.contains('\0')
            || !(1..=2700).contains(&self.width)
            || !(1..=3600).contains(&self.height)
            || !(50..=2200).contains(&self.width_tenths)
            || !(50..=3000).contains(&self.height_tenths)
        {
            return Err("Invalid printer or label dimensions.".into());
        }
        Ok(())
    }

    pub fn byte_count(&self) -> usize {
        self.width as usize * self.height as usize * 4
    }
}

pub(crate) struct StagedPages {
    file: File,
    page_bytes: usize,
    expected: usize,
    staged: usize,
}

impl StagedPages {
    pub fn new(settings: &PrintSettings, expected: usize) -> Result<Self, String> {
        settings.validate()?;
        if expected == 0 {
            return Err("Select at least one row to print.".into());
        }
        let file = tempfile::tempfile()
            .map_err(|error| format!("Could not prepare the CSV batch: {error}"))?;
        Ok(Self {
            file,
            page_bytes: settings.byte_count(),
            expected,
            staged: 0,
        })
    }

    pub fn append(&mut self, pixels: &[u8]) -> Result<(), String> {
        if self.staged == self.expected || pixels.len() != self.page_bytes {
            return Err("This label does not match the CSV batch.".into());
        }
        self.file
            .write_all(pixels)
            .map_err(|error| format!("Could not prepare a CSV label: {error}"))?;
        self.staged += 1;
        Ok(())
    }

    pub fn require_complete(&self) -> Result<(), String> {
        if self.staged != self.expected {
            return Err("The CSV batch is incomplete.".into());
        }
        Ok(())
    }

    pub fn into_pages(self) -> Result<impl Iterator<Item = Result<Vec<u8>, String>>, String> {
        self.require_complete()?;
        let Self {
            mut file,
            page_bytes,
            expected,
            ..
        } = self;
        file.rewind()
            .map_err(|error| format!("Could not open the prepared CSV batch: {error}"))?;
        Ok((0..expected).map(move |_| {
            let mut pixels = vec![0; page_bytes];
            file.read_exact(&mut pixels)
                .map_err(|error| format!("Could not read a prepared CSV label: {error}"))?;
            Ok(pixels)
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stages_complete_pages_in_order() {
        let settings = PrintSettings {
            printer: "Test printer".into(),
            width: 40,
            height: 40,
            width_tenths: 50,
            height_tenths: 50,
        };
        let mut staged = StagedPages::new(&settings, 2).unwrap();
        let first = vec![1; settings.byte_count()];
        let second = vec![2; settings.byte_count()];
        assert!(staged.append(&first[..15]).is_err());
        staged.append(&first).unwrap();
        assert!(staged.require_complete().is_err());
        staged.append(&second).unwrap();
        assert!(staged.append(&first).is_err());
        let pages = staged
            .into_pages()
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(pages, vec![first, second]);
    }
}
