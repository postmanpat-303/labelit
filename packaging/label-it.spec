Name:           label-it
Version:        %{labelit_version}
Release:        1%{?dist}
Summary:        Design labels, barcodes, and shipping tags
License:        Unspecified
Source0:        labelit
Source1:        app.labelit.editor.desktop
Source2:        icon.png
Source3:        BWIP-JS-LICENSE.txt
Source4:        INCONSOLATA-LICENSE.txt

%description
Label editor with exact-size PDF export.

%install
install -Dm755 %{SOURCE0} %{buildroot}%{_bindir}/labelit
install -Dm644 %{SOURCE1} %{buildroot}%{_datadir}/applications/app.labelit.editor.desktop
install -Dm644 %{SOURCE2} %{buildroot}%{_datadir}/icons/hicolor/32x32/apps/app.labelit.editor.png
install -Dm644 %{SOURCE3} %{buildroot}%{_docdir}/label-it/BWIP-JS-LICENSE.txt
install -Dm644 %{SOURCE4} %{buildroot}%{_docdir}/label-it/INCONSOLATA-LICENSE.txt

%files
%{_bindir}/labelit
%{_datadir}/applications/app.labelit.editor.desktop
%{_datadir}/icons/hicolor/32x32/apps/app.labelit.editor.png
%{_docdir}/label-it/
%global debug_package %{nil}

