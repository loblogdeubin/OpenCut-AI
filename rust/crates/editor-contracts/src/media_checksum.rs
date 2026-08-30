use sha2::{Digest, Sha256};

/// Incremental SHA-256 for large local media files.
///
/// The caller can stream bounded chunks instead of loading an entire footage
/// file into memory. The stable prefix keeps media hashes distinguishable from
/// unrelated identifiers at every boundary.
pub struct MediaChecksum {
    hasher: Option<Sha256>,
}

impl Default for MediaChecksum {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaChecksum {
    pub fn new() -> Self {
        Self {
            hasher: Some(Sha256::new()),
        }
    }

    pub fn update(&mut self, bytes: &[u8]) -> Result<(), &'static str> {
        let hasher = self.hasher.as_mut().ok_or("Media checksum is finalized")?;
        hasher.update(bytes);
        Ok(())
    }

    pub fn finish(&mut self) -> Result<String, &'static str> {
        let hasher = self.hasher.take().ok_or("Media checksum is finalized")?;
        Ok(format!("sha256:{:x}", hasher.finalize()))
    }
}

#[cfg(test)]
mod tests {
    use super::MediaChecksum;

    #[test]
    fn hashes_streamed_chunks_like_sha256() {
        let mut checksum = MediaChecksum::new();
        checksum.update(b"Open").unwrap();
        checksum.update(b"Cut").unwrap();
        assert_eq!(
            checksum.finish().unwrap(),
            "sha256:b751c9aea6a3221e642d07d60835b99a0b862ff0668173dadc16ded029540c7b"
        );
    }

    #[test]
    fn rejects_updates_after_finalization() {
        let mut checksum = MediaChecksum::new();
        checksum.finish().unwrap();
        assert_eq!(checksum.update(b"late"), Err("Media checksum is finalized"));
        assert_eq!(checksum.finish(), Err("Media checksum is finalized"));
    }
}
